const IST_OFFSET_MINUTES = 330;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface EquityCurvePoint {
  time: number;
  value: number;
}

export function roundTo(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function calculateMaxDrawdownPct(equityCurve: EquityCurvePoint[]): number {
  if (!Array.isArray(equityCurve) || equityCurve.length === 0) return 0;

  const ordered = [...equityCurve].sort((a, b) => a.time - b.time);
  let peak = 0;
  let maxDrawdown = 0;

  for (const point of ordered) {
    const value = Number(point.value);
    if (!Number.isFinite(value) || value <= 0) continue;

    if (value > peak) {
      peak = value;
      continue;
    }

    if (peak <= 0) continue;
    const drawdown = ((peak - value) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return roundTo(maxDrawdown, 2);
}

function toIstDayKey(epochMs: number): string {
  const shifted = epochMs + IST_OFFSET_MINUTES * 60 * 1000;
  const date = new Date(shifted);
  const y = date.getUTCFullYear();
  const m = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${date.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function calculateAnnualizedSharpeRatioFromEquityCurve(
  equityCurve: EquityCurvePoint[]
): number {
  if (!Array.isArray(equityCurve) || equityCurve.length < 2) return 0;

  const ordered = [...equityCurve].sort((a, b) => a.time - b.time);
  const dailyCloseByKey = new Map<string, number>();

  for (const point of ordered) {
    const value = Number(point.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    dailyCloseByKey.set(toIstDayKey(point.time), value);
  }

  const dailyValues = Array.from(dailyCloseByKey.values());
  if (dailyValues.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < dailyValues.length; i += 1) {
    const prev = dailyValues[i - 1];
    const curr = dailyValues[i];
    if (!Number.isFinite(prev) || prev <= 0 || !Number.isFinite(curr)) continue;
    returns.push((curr - prev) / prev);
  }

  if (returns.length < 2) return 0;

  const mean = returns.reduce((acc, value) => acc + value, 0) / returns.length;
  const variance =
    returns.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  if (!Number.isFinite(stdDev) || stdDev === 0) return 0;
  const sharpe = (mean / stdDev) * Math.sqrt(252);
  return roundTo(sharpe, 2);
}

export function getIstDayBoundsUtc(now = new Date()): { start: Date; end: Date } {
  const offsetMs = IST_OFFSET_MINUTES * 60 * 1000;
  const shifted = new Date(now.getTime() + offsetMs);

  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();

  const startMs = Date.UTC(y, m, d, 0, 0, 0, 0) - offsetMs;
  const endMs = startMs + ONE_DAY_MS;

  return {
    start: new Date(startMs),
    end: new Date(endMs),
  };
}
