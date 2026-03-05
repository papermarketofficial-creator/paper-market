import { LRUCache } from 'lru-cache';
import { logger } from "@/lib/logger";

/**
 * Configure standard cache options
 * Default TTL: 5 minutes
 * Default Max Items: 500
 */
const options = {
  max: 500,
  ttl: 1000 * 60 * 5, // 5 minutes
  allowStale: false,
  updateAgeOnGet: false,
  updateAgeOnHas: false,
};

export const cache = new LRUCache<string, any>(options);

export const CacheKeys = {
  // 🔥 CRITICAL FIX: Include unit in cache key
  // Without unit: "1 minute" and "1 day" have same key → wrong candles served
  historicalCandles: (instrumentKey: string, unit: string, interval: string, fromDate: string, toDate: string) => 
    `history:${instrumentKey}:${unit}:${interval}:${fromDate}:${toDate}`,
  instrumentKey: (symbol: string) => `instrument:${symbol}`
};

export function getFromCache<T>(key: string): T | undefined {
    const data = cache.get(key) as T | undefined;
    if (data) {
        logger.debug({ key }, "Cache HIT");
    } else {
        logger.debug({ key }, "Cache MISS");
    }
    return data;
}

export function setInCache<T>(key: string, value: T, ttl?: number): void {
    cache.set(key, value, { ttl });
    logger.debug({ key, ttl }, "Cache SET");
}

export function clearCache(): void {
    cache.clear();
    logger.info("Cache cleared");
}
