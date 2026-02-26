import { toInstrumentKey } from "@/lib/market/symbol-normalization";

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

const parseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === "string") return parseJsonObject(value);
  if (typeof value === "object") return value as Record<string, unknown>;
  return null;
};

const toFiniteNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeKey = (instrumentKey: string): string => toInstrumentKey(instrumentKey);
const toCacheSegment = (value: string): string =>
  encodeURIComponent(String(value || "").trim().toLowerCase() || "na");

export const ltpKey = (instrumentKey: string): string =>
  `${cachePrefix}:v1:ltp:${normalizeKey(instrumentKey)}`;

export const prevCloseKey = (instrumentKey: string): string =>
  `${cachePrefix}:v1:prevclose:${normalizeKey(instrumentKey)}`;

export const metaKey = (instrumentKey: string): string =>
  `${cachePrefix}:v1:meta:${normalizeKey(instrumentKey)}`;

export const getCacheTtlWithJitter = (): number =>
  CACHE_TTL_SECONDS + Math.floor(Math.random() * CACHE_TTL_JITTER_MAX_SECONDS);

export function parseMarketLtpCacheRecord(value: unknown): MarketLtpCacheRecord | null {
  const obj = asObject(value);
  if (!obj) return null;

  const instrumentKey = normalizeKey(String(obj.instrumentKey || ""));
  if (!instrumentKey) return null;

  const price = toFiniteNumber(obj.price);
  if (!price || price <= 0) return null;

  const rawPrevClose = toFiniteNumber(obj.prevClose);
  const prevClose = rawPrevClose && rawPrevClose > 0 ? rawPrevClose : price;

  const rawChange = toFiniteNumber(obj.change);
  const rawChangePct = toFiniteNumber(obj.changePct);
  const change = rawChange ?? price - prevClose;
  const changePct = rawChangePct ?? (prevClose > 0 ? (change / prevClose) * 100 : 0);

  const rawTimestamp = toFiniteNumber(obj.timestamp);
  const timestamp = rawTimestamp && rawTimestamp > 0 ? Math.floor(rawTimestamp) : Date.now();

  const symbol = typeof obj.symbol === "string" && obj.symbol.trim().length > 0 ? obj.symbol : undefined;

  return {
    instrumentKey,
    symbol,
    price,
    prevClose,
    change,
    changePct,
    timestamp,
  };
}
