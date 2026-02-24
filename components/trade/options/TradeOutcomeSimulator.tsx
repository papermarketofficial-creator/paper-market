"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { calculateLegPnL } from "@/lib/options/multi-leg-payoff";
import type { PayoffOptionType, PayoffSide } from "@/lib/options/multi-leg-payoff";

type TradeOutcomeSimulatorProps = {
  side: "BUY" | "SELL";
  optionType: "CE" | "PE";
  strike: number;
  quantity: number;
  premium: number;
  spotPrice: number;
};

function formatMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value >= 0 ? "+" : "-";
  return `${sign}₹${abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const RANGE_PCT = 0.07; // ±7% from spot

export function TradeOutcomeSimulator({
  side,
  optionType,
  strike,
  quantity,
  premium,
  spotPrice,
}: TradeOutcomeSimulatorProps) {
  // Slider value: -100 to +100 (maps to -RANGE_PCT to +RANGE_PCT)
  const [sliderValue, setSliderValue] = useState(0);

  const simulatedSpot = useMemo(() => {
    if (!Number.isFinite(spotPrice) || spotPrice <= 0) return spotPrice;
    return spotPrice * (1 + (sliderValue / 100) * RANGE_PCT);
  }, [sliderValue, spotPrice]);

  const pnl = useMemo(() => {
    if (!Number.isFinite(simulatedSpot) || !Number.isFinite(premium) || premium <= 0) return 0;
    return calculateLegPnL(
      {
        id: "sim",
        side: side as PayoffSide,
        optionType: optionType as PayoffOptionType,
        strike,
        quantity,
        premium,
      },
      simulatedSpot
    );
  }, [simulatedSpot, side, optionType, strike, quantity, premium]);

  const maxLoss = side === "BUY" ? -(premium * quantity) : null;
  const maxProfit = side === "BUY" ? null : premium * quantity;

  // Color representation
  const pnlPositive = pnl >= 0;
  const pctFill = useMemo(() => {
    // Normalize slider to 0–100 for the fill bar
    // Left half = loss zone, right half = profit zone
    return ((sliderValue + 100) / 200) * 100;
  }, [sliderValue]);

  // Find breakeven slider value
  const breakevenMovePercent = useMemo(() => {
    if (!Number.isFinite(spotPrice) || spotPrice <= 0 || !Number.isFinite(premium)) return null;
    let breakevenSpot: number;
    if (side === "BUY") {
      breakevenSpot = optionType === "CE" ? strike + premium : strike - premium;
    } else {
      breakevenSpot = optionType === "CE" ? strike + premium : strike - premium;
    }
    const movePct = ((breakevenSpot - spotPrice) / spotPrice) * 100;
    // Scale for slider
    const sliderPos = ((movePct / (RANGE_PCT * 100)) * 100);
    return Math.max(-95, Math.min(95, sliderPos));
  }, [side, optionType, strike, premium, spotPrice]);

  if (!Number.isFinite(spotPrice) || spotPrice <= 0 || !Number.isFinite(premium) || premium <= 0) {
    return null;
  }

  const movePct = (sliderValue / 100) * RANGE_PCT * 100;
  const moveLabel = movePct >= 0 ? `+${movePct.toFixed(2)}%` : `${movePct.toFixed(2)}%`;

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-200">What Happens If…</p>
        <span className="text-[11px] text-slate-400">Drag to simulate spot move</span>
      </div>

      {/* Price display */}
      <div className="flex items-center justify-between rounded-md bg-white/[0.04] px-3 py-2">
        <div className="text-xs text-slate-400">
          Spot moves{" "}
          <span
            className={cn(
              "font-semibold",
              movePct > 0 ? "text-emerald-400" : movePct < 0 ? "text-rose-400" : "text-slate-300"
            )}
          >
            {moveLabel}
          </span>
          {" "}to{" "}
          <span className="font-medium text-white">
            ₹{simulatedSpot.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div
          className={cn(
            "text-sm font-bold tabular-nums",
            pnlPositive ? "text-emerald-400" : "text-rose-400"
          )}
        >
          {formatMoney(pnl)}
        </div>
      </div>

      {/* Slider */}
      <div className="relative px-1">
        {/* Breakeven marker */}
        {breakevenMovePercent !== null && (
          <div
            className="pointer-events-none absolute top-0 h-full flex flex-col items-center"
            style={{ left: `calc(${((breakevenMovePercent + 100) / 200) * 100}% + 4px)` }}
          >
            <div className="h-3 w-px bg-amber-400/60" />
            <span className="mt-0.5 whitespace-nowrap text-[9px] text-amber-400/80">BE</span>
          </div>
        )}
        <input
          type="range"
          min={-100}
          max={100}
          value={sliderValue}
          onChange={(e) => setSliderValue(Number(e.target.value))}
          className="w-full cursor-pointer accent-[#2d6cff]"
          style={{ outline: "none" }}
        />
        <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
          <span>-{(RANGE_PCT * 100).toFixed(0)}%</span>
          <span>Spot</span>
          <span>+{(RANGE_PCT * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* P&L gradient bar */}
      <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-75"
          style={{
            width: `${pctFill}%`,
            background: pnlPositive
              ? "linear-gradient(90deg, rgba(239,68,68,.4), rgba(52,211,153,.8))"
              : "linear-gradient(90deg, rgba(239,68,68,.8), rgba(239,68,68,.4))",
          }}
        />
        {/* Center line */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded bg-white/[0.03] px-2 py-1.5 text-center">
          <p className="text-slate-500">Max Loss</p>
          <p className="font-semibold text-rose-400">
            {maxLoss !== null ? formatMoney(maxLoss) : "Unlimited"}
          </p>
        </div>
        <div className="rounded bg-white/[0.03] px-2 py-1.5 text-center">
          <p className="text-slate-500">At Expiry</p>
          <p className={cn("font-semibold", pnlPositive ? "text-emerald-400" : "text-rose-400")}>
            {formatMoney(pnl)}
          </p>
        </div>
        <div className="rounded bg-white/[0.03] px-2 py-1.5 text-center">
          <p className="text-slate-500">Max Profit</p>
          <p className="font-semibold text-emerald-400">
            {maxProfit !== null ? formatMoney(maxProfit) : "Unlimited"}
          </p>
        </div>
      </div>
    </div>
  );
}
