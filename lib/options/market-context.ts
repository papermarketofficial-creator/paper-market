/**
 * Market Context — derives simplified, heuristic market labels.
 * No financial math. Rule-based only.
 */

export type TrendDirection = "UP" | "DOWN" | "SIDEWAYS";
export type VolatilityLevel = "LOW" | "NORMAL" | "HIGH";
export type DteBucket = "FAR" | "NORMAL" | "EXPIRY";

export type MarketContext = {
  trend: TrendDirection;
  volatility: VolatilityLevel;
  dteBucket: DteBucket;
  isExpiryMode: boolean;
};

export function computeMarketContext(
  changePercent: number,
  daysToExpiry: number | null
): MarketContext {
  const abs = Math.abs(changePercent);

  let trend: TrendDirection;
  if (changePercent > 0.5) trend = "UP";
  else if (changePercent < -0.5) trend = "DOWN";
  else trend = "SIDEWAYS";

  let volatility: VolatilityLevel;
  if (abs < 0.5) volatility = "LOW";
  else if (abs < 1.5) volatility = "NORMAL";
  else volatility = "HIGH";

  let dteBucket: DteBucket;
  if (daysToExpiry === null || daysToExpiry > 10) dteBucket = "FAR";
  else if (daysToExpiry > 3) dteBucket = "NORMAL";
  else dteBucket = "EXPIRY";

  return {
    trend,
    volatility,
    dteBucket,
    isExpiryMode: dteBucket === "EXPIRY",
  };
}

/** Rule-based banner message for the expiry mode. */
export function getExpiryModeBanner(dteBucket: DteBucket, daysToExpiry: number | null): string | null {
  if (dteBucket !== "EXPIRY") return null;
  if (daysToExpiry !== null && daysToExpiry <= 0) {
    return "⚠️ Expiry Day — settlement today. New positions may be blocked.";
  }
  return "⚡ Expiry Mode — options move faster and decay quicker near expiry.";
}

/** Derive strategy intent label from strategy type */
export type StrategyIntent =
  | "Neutral"
  | "Bullish"
  | "Bearish"
  | "Income"
  | "Hedged";

export function getStrategyIntent(strategy: string): StrategyIntent {
  switch (strategy) {
    case "STRADDLE":
    case "STRANGLE":
      return "Neutral";
    case "BULL_CALL_SPREAD":
      return "Bullish";
    case "BEAR_PUT_SPREAD":
      return "Bearish";
    case "IRON_CONDOR":
      return "Income";
    case "VERTICAL_SPREAD":
      return "Hedged";
    default:
      return "Neutral";
  }
}

const INTENT_DESCRIPTIONS: Record<StrategyIntent, string> = {
  Neutral: "Profits from a big move in either direction.",
  Bullish: "Profits when the underlying rises.",
  Bearish: "Profits when the underlying falls.",
  Income: "Collects premium. Profits when market stays range-bound.",
  Hedged: "Defined risk. Both max profit and max loss are capped.",
};

export function getStrategyIntentDescription(intent: StrategyIntent): string {
  return INTENT_DESCRIPTIONS[intent];
}
