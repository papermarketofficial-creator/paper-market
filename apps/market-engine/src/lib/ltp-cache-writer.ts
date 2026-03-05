import { tickBus } from "../core/tick-bus.js";
import { toInstrumentKey } from "../core/symbol-normalization.js";
import type { NormalizedTick } from "../core/types.js";
import { logger } from "./logger.js";
import { getRedis } from "./redis.js";
import {
  getCacheTtlWithJitter,
  ltpKey,
  prevCloseKey,
  type MarketLtpCacheRecord,
} from "./market-cache.js";

const CACHE_FLUSH_INTERVAL_MS = 250;

let started = false;
let flushInFlight = false;
let flushTimer: NodeJS.Timeout | null = null;

const pendingByInstrument = new Map<string, MarketLtpCacheRecord>();
const prevCloseByInstrument = new Map<string, number>();

const toFiniteNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const buildRecordFromTick = (tick: NormalizedTick): MarketLtpCacheRecord | null => {
  const instrumentKey = toInstrumentKey(tick.instrumentKey || "");
  if (!instrumentKey) return null;

  const price = toFiniteNumber(tick.price);
  if (!price || price <= 0) return null;

  const incomingPrevClose = toFiniteNumber(tick.close);
  if (incomingPrevClose && incomingPrevClose > 0) {
    prevCloseByInstrument.set(instrumentKey, incomingPrevClose);
  }

  const rememberedPrevClose = prevCloseByInstrument.get(instrumentKey) ?? 0;
  const prevClose = rememberedPrevClose > 0 ? rememberedPrevClose : price;
  const change = prevClose > 0 ? price - prevClose : 0;
  const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

  const tickTimestamp = toFiniteNumber(tick.timestamp);
  const timestamp = tickTimestamp && tickTimestamp > 0 ? Math.floor(tickTimestamp * 1000) : Date.now();

  return {
    instrumentKey,
    symbol: tick.symbol,
    price,
    prevClose,
    change,
    changePct,
    timestamp,
  };
};

const scheduleFlush = (): void => {
  if (flushTimer) return;

  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushPendingWrites();
  }, CACHE_FLUSH_INTERVAL_MS);
};

const flushPendingWrites = (): void => {
  if (flushInFlight) {
    scheduleFlush();
    return;
  }

  if (pendingByInstrument.size === 0) {
    return;
  }

  const redis = getRedis();
  if (!redis) {
    pendingByInstrument.clear();
    return;
  }

  const batch = Array.from(pendingByInstrument.values());
  pendingByInstrument.clear();

  const pipeline = redis.pipeline();
  for (const quote of batch) {
    const ttlSeconds = getCacheTtlWithJitter();
    pipeline.set(ltpKey(quote.instrumentKey), quote, { ex: ttlSeconds });

    if (quote.prevClose > 0) {
      pipeline.set(prevCloseKey(quote.instrumentKey), quote.prevClose, { ex: ttlSeconds });
    }
  }

  flushInFlight = true;
  void pipeline
    .exec()
    .catch((error) => {
      logger.warn({ err: error, count: batch.length }, "Failed to flush LTP cache batch");
    })
    .finally(() => {
      flushInFlight = false;
      if (pendingByInstrument.size > 0) {
        scheduleFlush();
      }
    });
};

const enqueueTick = (tick: NormalizedTick): void => {
  const record = buildRecordFromTick(tick);
  if (!record) return;

  pendingByInstrument.set(record.instrumentKey, record);
  scheduleFlush();
};

export function startLtpCacheWriter(): void {
  if (started) return;
  started = true;

  tickBus.on("tick", enqueueTick);
  logger.info("LTP cache writer initialized");
}
