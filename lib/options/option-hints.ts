/**
 * Rule-based educational hints for the Options trading page.
 * Pure heuristics — no Black-Scholes or Greeks required.
 */

export type OptionHint = {
  id: string;
  message: string;
  /** visual accent color key */
  kind: "info" | "warn" | "tip";
};

type HintContext = {
  daysToExpiry: number | null;
  /** absolute distance from ATM as percentage of underlying price, e.g. 0.02 = 2% away */
  strikeDistancePct: number | null;
  /** "STRADDLE" | "STRANGLE" | "IRON_CONDOR" | "BULL_CALL_SPREAD" | "BEAR_PUT_SPREAD" | null */
  strategy: string | null;
  /** "BUY" | "SELL" | null */
  side: "BUY" | "SELL" | null;
  optionType: "CE" | "PE" | null;
  /** magnitude of underlying % change today */
  underlyingChangePct: number;
};

export function getContextHints(ctx: HintContext): OptionHint[] {
  const hints: OptionHint[] = [];
  const dte = ctx.daysToExpiry;

  // --- Expiry / Time-decay hints ---
  if (dte !== null && dte <= 1) {
    hints.push({
      id: "expiry-today",
      message: "⏰ Expiry today — open orders may be blocked by the expiry guard.",
      kind: "warn",
    });
  } else if (dte !== null && dte <= 5) {
    hints.push({
      id: "theta-accelerates",
      message: "⏳ Theta decay accelerates sharply in the last 5 days before expiry.",
      kind: "warn",
    });
  } else if (dte !== null && dte > 20) {
    hints.push({
      id: "time-value-high",
      message: "💡 More time remaining means higher extrinsic (time) value in premiums.",
      kind: "info",
    });
  }

  // --- Strike / Moneyness hints ---
  if (ctx.strikeDistancePct !== null) {
    if (ctx.strikeDistancePct < 0.005) {
      hints.push({
        id: "atm-selected",
        message: "🎯 ATM options have the highest time value and react fastest to price moves.",
        kind: "tip",
      });
    } else if (ctx.strikeDistancePct < 0.02) {
      hints.push({
        id: "near-atm",
        message: "📍 Near-the-money options balance premium cost with directional sensitivity.",
        kind: "info",
      });
    } else if (ctx.strikeDistancePct > 0.05) {
      hints.push({
        id: "deep-otm",
        message: "⚠️ Deep OTM options are cheap but require a large move to become profitable.",
        kind: "warn",
      });
    }
  }

  // --- Side / Direction hints ---
  if (ctx.side === "SELL") {
    hints.push({
      id: "selling-risk",
      message: "🚨 Selling options collects premium but can have large losses if the market moves against you.",
      kind: "warn",
    });
  }

  // --- Strategy-specific hints ---
  if (ctx.strategy === "STRADDLE" || ctx.strategy === "STRANGLE") {
    hints.push({
      id: "strategy-non-directional",
      message: "↔️ This strategy profits from a large price move in either direction.",
      kind: "info",
    });
  }

  if (
    ctx.strategy === "IRON_CONDOR" ||
    ctx.strategy === "BULL_CALL_SPREAD" ||
    ctx.strategy === "BEAR_PUT_SPREAD"
  ) {
    hints.push({
      id: "strategy-defined-risk",
      message: "🛡️ Defined-risk strategy: your maximum loss is capped at entry.",
      kind: "tip",
    });
  }

  // --- Volatility / regime hints ---
  if (ctx.underlyingChangePct >= 1.5) {
    hints.push({
      id: "high-vol-regime",
      message: "🔴 High volatility day — premiums are inflated. Be cautious buying options.",
      kind: "warn",
    });
  } else if (ctx.underlyingChangePct < 0.3) {
    hints.push({
      id: "low-vol-regime",
      message: "🟢 Low volatility environment — selling strategies tend to outperform.",
      kind: "tip",
    });
  }

  return hints.slice(0, 3); // cap at 3 so the UI doesn't overflow
}

export function getTrendLabel(changePct: number): "UP" | "DOWN" | "SIDEWAYS" {
  if (changePct >= 0.3) return "UP";
  if (changePct <= -0.3) return "DOWN";
  return "SIDEWAYS";
}

export function getVolatilityLabel(
  changePct: number
): "LOW" | "NORMAL" | "HIGH" {
  const abs = Math.abs(changePct);
  if (abs < 0.5) return "LOW";
  if (abs < 1.5) return "NORMAL";
  return "HIGH";
}
