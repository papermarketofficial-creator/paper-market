import { toInstrumentKey } from "../core/symbol-normalization.js";

export const CACHE_TTL_SECONDS = 3600;
export const CACHE_TTL_JITTER_MAX_SECONDS = 300;
export const cachePrefix = `pm:${process.env.NODE_ENV ?? "development"}`;

export interface MarketLtpCacheRecord {
  instrumentKey: string;
  symbol?: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  timestamp: number;
}

const normalizeKey = (instrumentKey: string): string => toInstrumentKey(instrumentKey);

export const ltpKey = (instrumentKey: string): string =>
  `${cachePrefix}:v1:ltp:${normalizeKey(instrumentKey)}`;

export const prevCloseKey = (instrumentKey: string): string =>
  `${cachePrefix}:v1:prevclose:${normalizeKey(instrumentKey)}`;

export const metaKey = (instrumentKey: string): string =>
  `${cachePrefix}:v1:meta:${normalizeKey(instrumentKey)}`;

export const getCacheTtlWithJitter = (): number =>
  CACHE_TTL_SECONDS + Math.floor(Math.random() * CACHE_TTL_JITTER_MAX_SECONDS);
