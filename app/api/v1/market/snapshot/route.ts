import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";
import {
  instruments,
  positions,
  watchlistItems,
  watchlists,
} from "@/lib/db/schema";
import {
  getCacheTtlWithJitter,
  ltpKey,
  parseMarketLtpCacheRecord,
  prevCloseKey,
  type MarketLtpCacheRecord,
} from "@/lib/market/market-cache";
import {
  symbolToIndexInstrumentKey,
  toCanonicalSymbol,
  toInstrumentKey,
} from "@/lib/market/symbol-normalization";

export const dynamic = "force-dynamic";

const INDEX_SYMBOLS = ["NIFTY 50", "NIFTY BANK", "NIFTY FIN SERVICE"] as const;
const ONE_MINUTE_MS = 60_000;
const SNAPSHOT_STATE_KEY = "__pmSnapshotRouteState";

type SymbolRow = {
  symbol: string | null;
  instrumentKey: string | null;
};

type SnapshotRouteMetrics = {
  singleflightHits: number;
  cacheHits: number;
  cacheMisses: number;
};

type SnapshotRouteState = {
  inflight: Map<string, Promise<MarketLtpCacheRecord[]>>;
  metrics: SnapshotRouteMetrics;
  metricsInterval: ReturnType<typeof setInterval> | null;
};

const logSnapshotLatency = (metrics: {
  auth_duration_ms: number;
  redis_read_ms: number;
  broker_fetch_ms: number;
  total_duration_ms: number;
}) => {
  queueMicrotask(() => {
    logger.info(metrics, "Snapshot latency");
  });
};

const getSnapshotRouteState = (): SnapshotRouteState => {
  const scope = globalThis as typeof globalThis & {
    [SNAPSHOT_STATE_KEY]?: SnapshotRouteState;
  };

  if (scope[SNAPSHOT_STATE_KEY]) {
    return scope[SNAPSHOT_STATE_KEY]!;
  }

  const state: SnapshotRouteState = {
    inflight: new Map<string, Promise<MarketLtpCacheRecord[]>>(),
    metrics: {
      singleflightHits: 0,
      cacheHits: 0,
      cacheMisses: 0,
    },
    metricsInterval: null,
  };

  state.metricsInterval = setInterval(() => {
    logger.info(
      {
        snapshot_singleflight_hits: state.metrics.singleflightHits,
        snapshot_cache_hits: state.metrics.cacheHits,
        snapshot_cache_misses: state.metrics.cacheMisses,
        snapshot_inflight_requests: state.inflight.size,
      },
      "Snapshot route metrics"
    );

    state.metrics.singleflightHits = 0;
    state.metrics.cacheHits = 0;
    state.metrics.cacheMisses = 0;
  }, ONE_MINUTE_MS);
  state.metricsInterval.unref?.();

  scope[SNAPSHOT_STATE_KEY] = state;
  return state;
};

const toFinitePositive = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const resolveInstrumentKey = (value: string): string => {
  const normalized = toInstrumentKey(value);
  if (normalized.includes("|")) return normalized;

  const indexKey = symbolToIndexInstrumentKey(toCanonicalSymbol(value));
  return indexKey ? toInstrumentKey(indexKey) : "";
};

const toUpstoxRequestInstrumentKey = (raw: string): string => {
  const normalized = String(raw || "")
    .trim()
    .replace(":", "|")
    .replace(/\s*\|\s*/g, "|")
    .replace(/\s+/g, " ");

  if (!normalized) return "";

  const [prefixRaw, suffixRaw = ""] = normalized.split("|");
  const prefix = String(prefixRaw || "").toUpperCase();
  const suffix = String(suffixRaw || "").trim();
  if (!suffix) return prefix;

  if (prefix.endsWith("_INDEX")) {
    const titled = suffix
      .toLowerCase()
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    return `${prefix}|${titled}`;
  }

  return `${prefix}|${suffix.toUpperCase()}`;
};

const pushSymbolCandidate = (
  keyOrder: string[],
  seen: Set<string>,
  symbolByInstrument: Map<string, string>,
  value: string | null | undefined,
  symbolHint?: string | null
) => {
  const resolved = resolveInstrumentKey(String(value || ""));
  if (!resolved || seen.has(resolved)) return;

  seen.add(resolved);
  keyOrder.push(resolved);

  const hinted = toCanonicalSymbol(String(symbolHint || ""));
  if (hinted) {
    symbolByInstrument.set(resolved, hinted);
  }
};

const toSnapshotQuote = (
  record: MarketLtpCacheRecord,
  symbolByInstrument: Map<string, string>
) => {
  const symbol =
    symbolByInstrument.get(record.instrumentKey) ||
    record.symbol ||
    record.instrumentKey.split("|")[1] ||
    record.instrumentKey;

  return {
    instrumentKey: record.instrumentKey,
    symbol,
    key: record.instrumentKey,
    price: record.price,
    close: record.prevClose,
    timestamp: record.timestamp,
  };
};

const snapshotSingleflightKey = (instrumentKeys: string[]): string => {
  const canonical = Array.from(new Set(instrumentKeys.map((key) => toInstrumentKey(key)).filter(Boolean))).sort();
  const hash = createHash("sha1").update(canonical.join(",")).digest("hex");
  return `snapshot:${hash}`;
};

async function fetchSnapshotMissesSingleflight(
  state: SnapshotRouteState,
  missingInstrumentKeys: string[]
): Promise<MarketLtpCacheRecord[]> {
  const key = snapshotSingleflightKey(missingInstrumentKeys);
  const existing = state.inflight.get(key);
  if (existing) {
    state.metrics.singleflightHits += 1;
    return existing;
  }

  const fetchPromise = (async () => {
    const { UpstoxService } = await import("@/services/upstox.service");
    const upstreamInstrumentKeys = Array.from(
      new Set(missingInstrumentKeys.map((value) => toUpstoxRequestInstrumentKey(value)).filter(Boolean))
    );
    if (upstreamInstrumentKeys.length === 0) return [];

    const detailByKey = await UpstoxService.getSystemQuoteDetails(upstreamInstrumentKeys);
    const now = Date.now();
    const fetchedRecords: MarketLtpCacheRecord[] = [];

    for (const [rawKey, detail] of Object.entries(detailByKey)) {
      const instrumentKey = toInstrumentKey(rawKey);
      if (!instrumentKey) continue;

      const price = toFinitePositive(detail?.lastPrice);
      if (!price) continue;

      const prevClose = toFinitePositive(detail?.closePrice) || price;
      const change = prevClose > 0 ? price - prevClose : 0;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      fetchedRecords.push({
        instrumentKey,
        price,
        prevClose,
        change,
        changePct,
        timestamp: now,
      });
    }

    return fetchedRecords;
  })().finally(() => {
    state.inflight.delete(key);
  });

  state.inflight.set(key, fetchPromise);
  return fetchPromise;
}

async function buildInstrumentRequestSet(
  watchlistRows: SymbolRow[],
  positionRows: SymbolRow[]
): Promise<{ requestKeys: string[]; requestedInstruments: string[]; symbolByInstrument: Map<string, string> }> {
  const requestKeys = Array.from(
    new Set([
      ...watchlistRows.map((row) => row.symbol),
      ...watchlistRows.map((row) => row.instrumentKey),
      ...positionRows.map((row) => row.symbol),
      ...positionRows.map((row) => row.instrumentKey),
      ...INDEX_SYMBOLS,
    ].filter(Boolean) as string[])
  );

  const requestedInstruments: string[] = [];
  const seen = new Set<string>();
  const symbolByInstrument = new Map<string, string>();

  for (const row of watchlistRows) {
    pushSymbolCandidate(requestedInstruments, seen, symbolByInstrument, row.instrumentKey, row.symbol);
  }

  for (const row of positionRows) {
    pushSymbolCandidate(requestedInstruments, seen, symbolByInstrument, row.instrumentKey, row.symbol);
  }

  for (const symbol of INDEX_SYMBOLS) {
    const indexInstrumentKey = symbolToIndexInstrumentKey(symbol);
    pushSymbolCandidate(requestedInstruments, seen, symbolByInstrument, indexInstrumentKey, symbol);
  }

  const unresolvedPositionSymbols = Array.from(
    new Set(
      positionRows
        .filter((row) => !row.instrumentKey && row.symbol)
        .map((row) => toCanonicalSymbol(String(row.symbol || "")))
        .filter(Boolean)
    )
  );

  if (unresolvedPositionSymbols.length > 0) {
    const instrumentRows = await db
      .select({
        symbol: instruments.tradingsymbol,
        instrumentKey: instruments.instrumentToken,
      })
      .from(instruments)
      .where(inArray(instruments.tradingsymbol, unresolvedPositionSymbols));

    for (const row of instrumentRows) {
      pushSymbolCandidate(requestedInstruments, seen, symbolByInstrument, row.instrumentKey, row.symbol);
    }
  }

  return { requestKeys, requestedInstruments, symbolByInstrument };
}

export async function GET() {
  const totalStart = performance.now();
  let authDurationMs = 0;
  let redisReadMs = 0;
  let brokerFetchMs = 0;

  try {
    const authStart = performance.now();
    const session = await auth();
    authDurationMs = performance.now() - authStart;
    if (!session?.user?.id) {
      logSnapshotLatency({
        auth_duration_ms: Number(authDurationMs.toFixed(2)),
        redis_read_ms: Number(redisReadMs.toFixed(2)),
        broker_fetch_ms: Number(brokerFetchMs.toFixed(2)),
        total_duration_ms: Number((performance.now() - totalStart).toFixed(2)),
      });
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const state = getSnapshotRouteState();

    const [watchlistRows, positionRows] = await Promise.all([
      db
        .select({
          symbol: instruments.tradingsymbol,
          instrumentKey: instruments.instrumentToken,
        })
        .from(watchlists)
        .innerJoin(watchlistItems, eq(watchlists.id, watchlistItems.watchlistId))
        .innerJoin(instruments, eq(watchlistItems.instrumentToken, instruments.instrumentToken))
        .where(eq(watchlists.userId, session.user.id)),
      db
        .select({
          symbol: positions.symbol,
          instrumentKey: instruments.instrumentToken,
        })
        .from(positions)
        .leftJoin(instruments, eq(positions.symbol, instruments.tradingsymbol))
        .where(eq(positions.userId, session.user.id)),
    ]);

    const { requestKeys, requestedInstruments, symbolByInstrument } =
      await buildInstrumentRequestSet(watchlistRows, positionRows);

    if (requestedInstruments.length === 0) {
      logSnapshotLatency({
        auth_duration_ms: Number(authDurationMs.toFixed(2)),
        redis_read_ms: Number(redisReadMs.toFixed(2)),
        broker_fetch_ms: Number(brokerFetchMs.toFixed(2)),
        total_duration_ms: Number((performance.now() - totalStart).toFixed(2)),
      });
      return NextResponse.json({
        success: true,
        data: {
          symbols: requestKeys,
          quotes: [],
        },
      });
    }

    const quoteByInstrument = new Map<string, MarketLtpCacheRecord>();
    const redis = getRedis();

    if (redis) {
      const redisStart = performance.now();
      try {
        const cacheValues = await redis.mget(...requestedInstruments.map((key) => ltpKey(key)));
        cacheValues.forEach((value, idx) => {
          const parsed = parseMarketLtpCacheRecord(value);
          if (!parsed) return;

          if (!parsed.symbol) {
            parsed.symbol = symbolByInstrument.get(parsed.instrumentKey);
          }
          quoteByInstrument.set(requestedInstruments[idx], parsed);
        });
      } catch (error) {
        logger.warn({ err: error }, "Snapshot Redis read failed, falling back to Upstox");
      }
      redisReadMs += performance.now() - redisStart;
    }

    const missingInstrumentKeys = requestedInstruments.filter((key) => !quoteByInstrument.has(key));
    state.metrics.cacheHits += quoteByInstrument.size;
    state.metrics.cacheMisses += missingInstrumentKeys.length;

    if (missingInstrumentKeys.length > 0) {
      const brokerStart = performance.now();
      const fetchedRecords = await fetchSnapshotMissesSingleflight(state, missingInstrumentKeys);
      brokerFetchMs += performance.now() - brokerStart;
      for (const record of fetchedRecords) {
        const hydratedRecord: MarketLtpCacheRecord = {
          ...record,
          symbol: record.symbol || symbolByInstrument.get(record.instrumentKey),
        };
        quoteByInstrument.set(hydratedRecord.instrumentKey, hydratedRecord);
      }

      if (redis && fetchedRecords.length > 0) {
        try {
          const pipeline = redis.pipeline();

          for (const record of fetchedRecords) {
            const payload: MarketLtpCacheRecord = {
              ...record,
              symbol: record.symbol || symbolByInstrument.get(record.instrumentKey),
            };
            const ttlSeconds = getCacheTtlWithJitter();
            pipeline.set(ltpKey(payload.instrumentKey), payload, { ex: ttlSeconds });
            if (payload.prevClose > 0) {
              pipeline.set(prevCloseKey(payload.instrumentKey), payload.prevClose, { ex: ttlSeconds });
            }
          }

          void pipeline.exec().catch((error) => {
            logger.warn({ err: error, count: fetchedRecords.length }, "Snapshot Redis backfill failed");
          });
        } catch (error) {
          logger.warn({ err: error }, "Snapshot Redis pipeline creation failed");
        }
      }
    }

    const quotes = requestedInstruments
      .map((key) => quoteByInstrument.get(key))
      .filter((record): record is MarketLtpCacheRecord => Boolean(record))
      .map((record) => toSnapshotQuote(record, symbolByInstrument));

    logSnapshotLatency({
      auth_duration_ms: Number(authDurationMs.toFixed(2)),
      redis_read_ms: Number(redisReadMs.toFixed(2)),
      broker_fetch_ms: Number(brokerFetchMs.toFixed(2)),
      total_duration_ms: Number((performance.now() - totalStart).toFixed(2)),
    });

    return NextResponse.json({
      success: true,
      data: {
        symbols: requestKeys,
        quotes,
      },
    });
  } catch (error: any) {
    logSnapshotLatency({
      auth_duration_ms: Number(authDurationMs.toFixed(2)),
      redis_read_ms: Number(redisReadMs.toFixed(2)),
      broker_fetch_ms: Number(brokerFetchMs.toFixed(2)),
      total_duration_ms: Number((performance.now() - totalStart).toFixed(2)),
    });
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to load market snapshot",
      },
      { status: 500 }
    );
  }
}

