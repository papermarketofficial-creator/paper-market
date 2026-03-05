"use client";

import { cn } from "@/lib/utils";
import { Search, BookOpen } from "lucide-react";
import { getTrendLabel, getVolatilityLabel } from "@/lib/options/option-hints";
import { computeMarketContext, getExpiryModeBanner } from "@/lib/options/market-context";
import { useLearningModeStore } from "@/stores/options/learning-mode.store";

type TradeMode = "single" | "strategy";

type UnderlyingHeaderProps = {
  underlyingLabel: string;
  underlyingPrice: number;
  underlyingChangePercent: number;
  selectedExpiry: string;
  expiries: string[];
  daysToExpiry: number | null;
  atmStrike: number | null;
  mode: TradeMode;
  onOpenSearch: () => void;
  onModeChange: (mode: TradeMode) => void;
  onExpiryChange: (expiry: string) => void;
};

function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "--";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatChange(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const signed = value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
  return `${signed}%`;
}

const TREND_STYLES = {
  UP: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  DOWN: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
  SIDEWAYS: "bg-white/[0.06] text-slate-300 border border-white/[0.1]",
};

const TREND_ICONS = { UP: "▲", DOWN: "▼", SIDEWAYS: "→" };

const VOL_STYLES = {
  LOW: "bg-emerald-500/10 text-emerald-400",
  NORMAL: "bg-amber-500/10 text-amber-400",
  HIGH: "bg-rose-500/10 text-rose-400",
};

export function UnderlyingHeader({
  underlyingLabel,
  underlyingPrice,
  underlyingChangePercent,
  selectedExpiry,
  expiries,
  daysToExpiry,
  atmStrike,
  mode,
  onOpenSearch,
  onModeChange,
  onExpiryChange,
}: UnderlyingHeaderProps) {
  const trend = getTrendLabel(underlyingChangePercent);
  const volatility = getVolatilityLabel(underlyingChangePercent);
  const ctx = computeMarketContext(underlyingChangePercent, daysToExpiry);
  const expiryBanner = getExpiryModeBanner(ctx.dteBucket, daysToExpiry);

  const isLearningMode = useLearningModeStore((s) => s.isOn);
  const toggleLearning = useLearningModeStore((s) => s.toggle);

  return (
    <section className="rounded-2xl bg-[linear-gradient(180deg,rgba(17,24,39,.75),rgba(8,12,22,.88))] shadow-[0_10px_35px_rgba(0,0,0,.28)]">
      {/* ── Expiry mode banner ── */}
      {expiryBanner && (
        <div className="flex items-center justify-center gap-2 rounded-t-2xl border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-300">
          {expiryBanner}
        </div>
      )}

      <div className="px-4 py-3">
        {/* Row 1: Symbol + Price + Market Badges */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
            title="Search option contract"
          >
            <Search className="h-4 w-4" />
          </button>

          <div className="min-w-0">
            <p className="text-[11px] tracking-wide text-slate-400">Option Chain for</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[32px] font-semibold leading-none text-white">
                {underlyingLabel || "OPTIONS"}
              </h2>
              <p className="text-sm font-semibold tabular-nums text-white">
                {formatPrice(underlyingPrice)}
              </p>
              <span
                className={cn(
                  "text-xs font-semibold tabular-nums",
                  underlyingChangePercent >= 0 ? "text-emerald-400" : "text-rose-400"
                )}
              >
                {formatChange(underlyingChangePercent)}
              </span>
            </div>
          </div>

          {/* Market context badges */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold", TREND_STYLES[trend])}>
              {TREND_ICONS[trend]} {trend}
            </span>
            <span className={cn("rounded-lg px-2 py-1 text-[11px] font-semibold", VOL_STYLES[volatility])}>
              VOL: {volatility}
            </span>
            <span className="rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-slate-300">
              ATM: {atmStrike ? atmStrike.toLocaleString("en-IN") : "--"}
            </span>

            {/* Learning mode toggle */}
            <button
              type="button"
              onClick={toggleLearning}
              title={isLearningMode ? "Learning Mode: ON" : "Learning Mode: OFF"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                isLearningMode
                  ? "border-[#2d6cff]/40 bg-[#2d6cff]/15 text-[#8fb3ff]"
                  : "border-white/[0.1] bg-white/[0.04] text-slate-500 hover:text-slate-300"
              )}
            >
              <BookOpen className="h-3 w-3" />
              {isLearningMode ? "Learning: ON" : "Learning: OFF"}
            </button>
          </div>
        </div>

        {/* Row 2: Mode toggle + Search */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenSearch}
            className="rounded-xl border border-white/20 bg-[#111c33] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#172746]"
          >
            Search Contract
          </button>

          <div className="inline-flex rounded-xl border border-white/20 bg-[#0f1a30] p-1 shadow-[0_4px_18px_rgba(0,0,0,.25)]">
            <button
              type="button"
              onClick={() => onModeChange("single")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                mode === "single" ? "bg-[#2d6cff] text-white" : "text-slate-100/70 hover:bg-white/[0.08] hover:text-white"
              )}
            >
              Single Leg
            </button>
            <button
              type="button"
              onClick={() => onModeChange("strategy")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                mode === "strategy" ? "bg-[#2d6cff] text-white" : "text-slate-100/70 hover:bg-white/[0.08] hover:text-white"
              )}
            >
              Build Strategy
            </button>
          </div>
        </div>

        {/* Row 3: Expiry tabs + DTE */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {expiries.length === 0 ? (
              <span className="rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-slate-400">No expiries</span>
            ) : (
              expiries.map((item) => {
                const active = item === selectedExpiry;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onExpiryChange(item)}
                    className={cn(
                      "whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
                      active
                        ? "border-[#2d6cff] bg-[#2d6cff]/15 text-[#9fc1ff]"
                        : "border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-white/[0.14] hover:text-white"
                    )}
                  >
                    {item}
                  </button>
                );
              })
            )}
          </div>

          <div className="shrink-0 rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs text-slate-300">
            DTE:{" "}
            <span className={cn("font-semibold", daysToExpiry !== null && daysToExpiry <= 5 ? "text-amber-400" : "text-white")}>
              {daysToExpiry === null ? "--" : `${Math.max(0, daysToExpiry)} days`}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
