import { ATR, BollingerBands, EMA, MACD, RSI, SMA } from "technicalindicators";
import type { IndicatorConfig } from "@/stores/trading/analysis.store";
import { trackAnalysisEvent } from "@/lib/analysis/telemetry";

type CandleLike = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type ComputedIndicator = {
  config: IndicatorConfig;
  data: any[];
  series?: {
    macd?: any[];
    signal?: any[];
    histogram?: any[];
    middle?: any[];
    upper?: any[];
    lower?: any[];
  };
};

type ComputeInput = {
  symbol: string;
  instrumentKey: string;
  candles: CandleLike[];
  indicators: IndicatorConfig[];
};

const CACHE_MAX_ENTRIES = 500;
const indicatorCache = new Map<string, ComputedIndicator>();

const toFinite = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mapSimpleSeries = (values: number[], candles: CandleLike[], offset: number) =>
  values
    .map((value, index) => {
      const row = candles[index + offset];
      if (!row) return null;
      return { time: row.time, value: toFinite(value) };
    })
    .filter((item): item is { time: number; value: number } => Boolean(item));

const getParam = (indicator: IndicatorConfig, key: string, fallback: number) =>
  toFinite(indicator.params?.[key], fallback);

function cacheKey(input: ComputeInput, indicator: IndicatorConfig): string {
  const firstTime = input.candles[0]?.time ?? 0;
  const last = input.candles[input.candles.length - 1];
  const lastTime = last?.time ?? 0;
  const lastClose = last?.close ?? 0;
  return [
    input.instrumentKey || input.symbol,
    indicator.id,
    indicator.type,
    input.candles.length,
    firstTime,
    lastTime,
    lastClose,
    JSON.stringify(indicator.params || {}),
    JSON.stringify(indicator.display || {}),
  ].join("|");
}

function setCache(key: string, value: ComputedIndicator) {
  indicatorCache.set(key, value);
  if (indicatorCache.size > CACHE_MAX_ENTRIES) {
    const firstKey = indicatorCache.keys().next().value;
    if (firstKey) indicatorCache.delete(firstKey);
  }
}

function toDateKey(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000);
  const y = date.getUTCFullYear();
  const m = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${date.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function computeVwap(candles: CandleLike[]) {
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  let sessionKey = "";
  const out: Array<{ time: number; value: number }> = [];

  for (const candle of candles) {
    const dayKey = toDateKey(candle.time);
    if (dayKey !== sessionKey) {
      sessionKey = dayKey;
      cumulativePV = 0;
      cumulativeVolume = 0;
    }

    const typical = (candle.high + candle.low + candle.close) / 3;
    const volume = Math.max(1, toFinite(candle.volume, 1));
    cumulativePV += typical * volume;
    cumulativeVolume += volume;
    out.push({
      time: candle.time,
      value: cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : candle.close,
    });
  }

  return out;
}

function computeSupertrend(candles: CandleLike[], period: number, multiplier: number) {
  if (candles.length < period + 2) return [];
  const highs = candles.map((item) => item.high);
  const lows = candles.map((item) => item.low);
  const closes = candles.map((item) => item.close);
  const atr = ATR.calculate({ period, high: highs, low: lows, close: closes });
  if (atr.length === 0) return [];

  const offset = candles.length - atr.length;
  let prevFinalUpper = 0;
  let prevFinalLower = 0;
  let prevTrendUp = true;
  const out: Array<{ time: number; value: number }> = [];

  for (let i = offset; i < candles.length; i++) {
    const atrIndex = i - offset;
    const atrValue = atr[atrIndex];
    if (!Number.isFinite(atrValue)) continue;

    const candle = candles[i];
    const hl2 = (candle.high + candle.low) / 2;
    const basicUpper = hl2 + multiplier * atrValue;
    const basicLower = hl2 - multiplier * atrValue;

    const prevClose = i > 0 ? candles[i - 1].close : candle.close;
    const finalUpper =
      i === offset || basicUpper < prevFinalUpper || prevClose > prevFinalUpper ? basicUpper : prevFinalUpper;
    const finalLower =
      i === offset || basicLower > prevFinalLower || prevClose < prevFinalLower ? basicLower : prevFinalLower;

    const trendUp: boolean =
      i === offset
        ? candle.close >= finalLower
        : (prevTrendUp ? candle.close >= finalLower : candle.close > finalUpper);
    const supertrendValue = trendUp ? finalLower : finalUpper;

    out.push({
      time: candle.time,
      value: supertrendValue,
    });

    prevFinalUpper = finalUpper;
    prevFinalLower = finalLower;
    prevTrendUp = trendUp;
  }

  return out;
}

function computeSingle(input: ComputeInput, indicator: IndicatorConfig): ComputedIndicator {
  const key = cacheKey(input, indicator);
  const cached = indicatorCache.get(key);
  if (cached) return cached;

  const candles = input.candles;
  if (!indicator.display?.visible || candles.length === 0) {
    return { config: indicator, data: [] };
  }

  const closes = candles.map((item) => item.close);
  const highs = candles.map((item) => item.high);
  const lows = candles.map((item) => item.low);

  let computed: ComputedIndicator = { config: indicator, data: [] };
  try {
    switch (indicator.type) {
      case "SMA": {
        const period = Math.max(1, getParam(indicator, "period", 20));
        const result = SMA.calculate({ period, values: closes });
        computed = { config: indicator, data: mapSimpleSeries(result, candles, period - 1) };
        break;
      }
      case "EMA": {
        const period = Math.max(1, getParam(indicator, "period", 20));
        const result = EMA.calculate({ period, values: closes });
        computed = { config: indicator, data: mapSimpleSeries(result, candles, period - 1) };
        break;
      }
      case "RSI": {
        const period = Math.max(1, getParam(indicator, "period", 14));
        const result = RSI.calculate({ period, values: closes });
        computed = { config: indicator, data: mapSimpleSeries(result, candles, period) };
        break;
      }
      case "MACD": {
        const fast = Math.max(1, getParam(indicator, "fastPeriod", 12));
        const slow = Math.max(fast + 1, getParam(indicator, "slowPeriod", 26));
        const signal = Math.max(1, getParam(indicator, "signalPeriod", 9));
        const result = MACD.calculate({
          values: closes,
          fastPeriod: fast,
          slowPeriod: slow,
          signalPeriod: signal,
          SimpleMAOscillator: false,
          SimpleMASignal: false,
        });
        const offset = candles.length - result.length;
        const macd = result
          .map((value, index) =>
            Number.isFinite(Number(value.MACD)) ? { time: candles[index + offset]?.time, value: Number(value.MACD) } : null
          )
          .filter((item): item is { time: number; value: number } => Boolean(item && Number.isFinite(item.time)));
        const signalData = result
          .map((value, index) =>
            Number.isFinite(Number(value.signal))
              ? { time: candles[index + offset]?.time, value: Number(value.signal) }
              : null
          )
          .filter((item): item is { time: number; value: number } => Boolean(item && Number.isFinite(item.time)));
        const histogram = result
          .map((value, index) => {
            const row = candles[index + offset];
            if (!row) return null;
            const num = Number(value.histogram);
            if (!Number.isFinite(num)) return null;
            return {
              time: row.time,
              value: num,
              color: num >= 0 ? "#26a69a" : "#ef5350",
            };
          })
          .filter(
            (item): item is { time: number; value: number; color: string } =>
              Boolean(item && Number.isFinite(item.time))
          );
        computed = {
          config: indicator,
          data: macd,
          series: {
            macd,
            signal: signalData,
            histogram,
          },
        };
        break;
      }
      case "BB": {
        const period = Math.max(1, getParam(indicator, "period", 20));
        const stdDev = Math.max(0.1, getParam(indicator, "stdDev", 2));
        const result = BollingerBands.calculate({ period, stdDev, values: closes });
        const mapped = result
          .map((value, index) => {
            const row = candles[index + period - 1];
            if (!row) return null;
            return {
              time: row.time,
              middle: Number(value.middle),
              upper: Number(value.upper),
              lower: Number(value.lower),
            };
          })
          .filter(
            (item): item is { time: number; middle: number; upper: number; lower: number } =>
              Boolean(item && Number.isFinite(item.time))
          );
        const middle = mapped.map((item) => ({ time: item.time, value: item.middle }));
        const upper = mapped.map((item) => ({ time: item.time, value: item.upper }));
        const lower = mapped.map((item) => ({ time: item.time, value: item.lower }));
        computed = {
          config: indicator,
          data: middle,
          series: {
            middle,
            upper,
            lower,
          },
        };
        break;
      }
      case "VWAP": {
        computed = { config: indicator, data: computeVwap(candles) };
        break;
      }
      case "ATR": {
        const period = Math.max(1, getParam(indicator, "period", 14));
        const result = ATR.calculate({ period, high: highs, low: lows, close: closes });
        computed = { config: indicator, data: mapSimpleSeries(result, candles, period) };
        break;
      }
      case "SUPERTREND": {
        const period = Math.max(1, getParam(indicator, "period", 10));
        const multiplier = Math.max(0.1, getParam(indicator, "multiplier", 3));
        computed = {
          config: indicator,
          data: computeSupertrend(candles, period, multiplier),
        };
        break;
      }
      default:
        computed = { config: indicator, data: [] };
    }
  } catch (error) {
    console.error("Indicator compute failed:", indicator.type, error);
    trackAnalysisEvent({
      name: "indicator_compute_failed",
      level: "error",
      payload: {
        indicatorType: indicator.type,
        indicatorId: indicator.id,
        symbol: input.symbol,
        instrumentKey: input.instrumentKey,
        candleCount: candles.length,
      },
    });
    computed = { config: indicator, data: [] };
  }

  setCache(key, computed);
  return computed;
}

export function computeIndicators(input: ComputeInput): ComputedIndicator[] {
  if (!Array.isArray(input.candles) || input.candles.length === 0) return [];
  if (!Array.isArray(input.indicators) || input.indicators.length === 0) return [];
  return input.indicators.map((indicator) => computeSingle(input, indicator));
}

type ScheduledResult<T> = {
  cancel: () => void;
  runImmediately: () => T;
};

export function scheduleIndicatorComputation<T>(
  task: () => T,
  onResult: (value: T) => void
): ScheduledResult<T> {
  if (typeof window === "undefined") {
    const value = task();
    onResult(value);
    return {
      cancel: () => undefined,
      runImmediately: () => value,
    };
  }

  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let idleId: number | null = null;

  const runTask = () => {
    if (cancelled) return;
    const value = task();
    if (!cancelled) onResult(value);
  };

  if ("requestIdleCallback" in window) {
    idleId = (window as any).requestIdleCallback(runTask, { timeout: 120 });
  } else {
    timeoutId = setTimeout(runTask, 0);
  }

  return {
    cancel: () => {
      cancelled = true;
      if (idleId !== null && "cancelIdleCallback" in window) {
        (window as any).cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    },
    runImmediately: () => task(),
  };
}
