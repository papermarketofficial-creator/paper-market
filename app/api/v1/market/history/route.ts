import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { CandleOrchestrator, type CandleResult } from "@/lib/market/candle-orchestrator";
import { getRedis } from "@/lib/redis";
import { getHistoryCacheTtlSeconds, historyKey } from "@/lib/market/market-cache";
import { toInstrumentKey } from "@/lib/market/symbol-normalization";

const ONE_MINUTE_MS = 60_000;
const MAX_SYMBOLS_PER_REQUEST = Number(process.env.HISTORY_MAX_SYMBOLS_PER_REQUEST ?? 5);
const MAX_HISTORY_REQUESTS_PER_MINUTE = Number(process.env.HISTORY_MAX_REQUESTS_PER_MINUTE ?? 30);
const MAX_CONCURRENT_HISTORY_FETCHES = Number(process.env.HISTORY_MAX_CONCURRENT_FETCHES ?? 5);
const HISTORY_STATE_KEY = "__pmHistoryRouteState";

type RateLimitBucket = { count: number; resetAt: number };

type HistoryRouteMetrics = {
  cacheHits: number;
  cacheMisses: number;
  singleflightHits: number;
  rateLimited: number;
};

type HistoryRouteState = {
  inflight: Map<string, Promise<CandleResult>>;
  rateLimitByKey: Map<string, RateLimitBucket>;
  activeFetches: number;
  metrics: HistoryRouteMetrics;
  metricsInterval: ReturnType<typeof setInterval> | null;
};

const parseListParam = (req: NextRequest, key: string): string[] =>
  req.nextUrl.searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

const parseCachedHistory = (value: unknown): CandleResult | null => {
  const payload =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return null;
          }
        })()
      : value;

  if (!payload || typeof payload !== "object") return null;

  const parsed = payload as { candles?: unknown; volume?: unknown };
  const candles = Array.isArray(parsed.candles) ? parsed.candles : null;
  const volume = Array.isArray(parsed.volume) ? parsed.volume : null;
  if (!candles || !volume) return null;

  return { candles: candles as any[], volume: volume as any[] };
};

const getClientIp = (req: NextRequest): string | null => {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return null;
};

const getRateLimitKey = (req: NextRequest, userId?: string): string => {
  const ip = getClientIp(req);
  if (ip) return `ip:${ip}`;
  if (userId) return `uid:${userId}`;
  return "anonymous:unknown";
};

const consumeRateLimit = (state: HistoryRouteState, key: string): boolean => {
  const now = Date.now();
  const bucket = state.rateLimitByKey.get(key);

  if (!bucket || now >= bucket.resetAt) {
    state.rateLimitByKey.set(key, { count: 1, resetAt: now + ONE_MINUTE_MS });
    return true;
  }

  if (bucket.count >= MAX_HISTORY_REQUESTS_PER_MINUTE) {
    return false;
  }

  bucket.count += 1;
  return true;
};

const getHistoryRouteState = (): HistoryRouteState => {
  const scope = globalThis as typeof globalThis & {
    [HISTORY_STATE_KEY]?: HistoryRouteState;
  };

  if (scope[HISTORY_STATE_KEY]) {
    return scope[HISTORY_STATE_KEY]!;
  }

  const state: HistoryRouteState = {
    inflight: new Map<string, Promise<CandleResult>>(),
    rateLimitByKey: new Map<string, RateLimitBucket>(),
    activeFetches: 0,
    metrics: {
      cacheHits: 0,
      cacheMisses: 0,
      singleflightHits: 0,
      rateLimited: 0,
    },
    metricsInterval: null,
  };

  state.metricsInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of state.rateLimitByKey.entries()) {
      if (bucket.resetAt <= now) {
        state.rateLimitByKey.delete(key);
      }
    }

    logger.info(
      {
        history_cache_hits: state.metrics.cacheHits,
        history_cache_misses: state.metrics.cacheMisses,
        history_singleflight_hits: state.metrics.singleflightHits,
        history_rate_limited: state.metrics.rateLimited,
        history_inflight_requests: state.inflight.size,
      },
      "History route metrics"
    );

    state.metrics.cacheHits = 0;
    state.metrics.cacheMisses = 0;
    state.metrics.singleflightHits = 0;
    state.metrics.rateLimited = 0;
  }, ONE_MINUTE_MS);
  state.metricsInterval.unref?.();

  scope[HISTORY_STATE_KEY] = state;
  return state;
};

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const state = getHistoryRouteState();
    const limiterKey = getRateLimitKey(req, session.user?.id);
    if (!consumeRateLimit(state, limiterKey)) {
      state.metrics.rateLimited += 1;
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded for history requests" },
        { status: 429 }
      );
    }

    const instrumentKeyInputs = parseListParam(req, "instrumentKey");
    const symbolInputs = parseListParam(req, "symbol");

    if (instrumentKeyInputs.length > MAX_SYMBOLS_PER_REQUEST || symbolInputs.length > MAX_SYMBOLS_PER_REQUEST) {
      return NextResponse.json(
        { success: false, error: `Max symbols per request is ${MAX_SYMBOLS_PER_REQUEST}` },
        { status: 400 }
      );
    }

    if (instrumentKeyInputs.length > 1 || symbolInputs.length > 1) {
      return NextResponse.json(
        { success: false, error: "Batch history requests are not supported on this route" },
        { status: 400 }
      );
    }

    const symbol = symbolInputs[0] || null;
    const instrumentKeyParam = instrumentKeyInputs[0] || null;
    const timeframe = req.nextUrl.searchParams.get("timeframe") || req.nextUrl.searchParams.get("interval") || undefined;
    const range = req.nextUrl.searchParams.get("range") || undefined;
    const toDate = req.nextUrl.searchParams.get("toDate") || undefined;

    let instrumentKey: string;
    if (instrumentKeyParam) {
      instrumentKey = toInstrumentKey(instrumentKeyParam);
    } else if (symbol) {
      const { UpstoxService } = await import("@/services/upstox.service");
      instrumentKey = await UpstoxService.resolveInstrumentKey(symbol);
    } else {
      return NextResponse.json({ success: false, error: "Missing symbol or instrumentKey" }, { status: 400 });
    }

    if (!instrumentKey) {
      return NextResponse.json({ success: false, error: "Invalid instrument key" }, { status: 400 });
    }

    const cacheKey = historyKey(instrumentKey, timeframe || "1m", range || "default", toDate);
    const redis = getRedis();

    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        const parsed = parseCachedHistory(cached);
        if (parsed) {
          state.metrics.cacheHits += 1;
          return NextResponse.json({ success: true, data: parsed });
        }
      } catch (error) {
        logger.warn({ err: error, cacheKey }, "History Redis read failed");
      }
    }

    state.metrics.cacheMisses += 1;

    const existing = state.inflight.get(cacheKey);
    if (existing) {
      state.metrics.singleflightHits += 1;
      const data = await existing;
      return NextResponse.json({ success: true, data });
    }

    if (state.activeFetches >= MAX_CONCURRENT_HISTORY_FETCHES) {
      state.metrics.rateLimited += 1;
      return NextResponse.json(
        { success: false, error: "History concurrency limit exceeded" },
        { status: 429 }
      );
    }

    state.activeFetches += 1;

    const requestPromise = CandleOrchestrator.fetchCandles({
      instrumentKey,
      timeframe,
      range,
      toDate,
    }).finally(() => {
      state.inflight.delete(cacheKey);
      state.activeFetches = Math.max(0, state.activeFetches - 1);
    });

    state.inflight.set(cacheKey, requestPromise);
    const data = await requestPromise;

    if (redis) {
      const ttlSeconds = getHistoryCacheTtlSeconds();
      void redis.set(cacheKey, data, { ex: ttlSeconds }).catch((error) => {
        logger.warn({ err: error, cacheKey }, "History Redis write failed");
      });
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    if (process.env.DEBUG_MARKET === "true") {
      logger.error({ err: error }, "Historical API error");
    }
    return NextResponse.json({ success: false, error: error?.message || "History fetch failed" }, { status: 500 });
  }
}
