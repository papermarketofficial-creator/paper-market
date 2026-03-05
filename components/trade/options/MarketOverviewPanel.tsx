"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { OptionHint } from "@/lib/options/option-hints";
import { Lightbulb } from "lucide-react";

const CandlestickChart = dynamic(
  () =>
    import("@/components/trade/CandlestickChart").then((mod) => ({
      default: mod.CandlestickChart,
    })),
  {
    loading: () => (
      <div className="h-[260px] w-full animate-pulse rounded-xl bg-[linear-gradient(120deg,rgba(15,23,42,.9),rgba(30,41,59,.75),rgba(15,23,42,.9))]" />
    ),
    ssr: false,
  }
);

type MarketOverviewPanelProps = {
  underlyingSymbol: string;
  instrumentKey?: string;
  expiry: string;
  atmStrike: number | null;
  daysToExpiry: number | null;
  hints: OptionHint[];
  onSearchClick: () => void;
};

const KIND_STYLES: Record<OptionHint["kind"], string> = {
  info: "border-[#2d6cff]/30 bg-[#2d6cff]/8 text-[#8fb3ff]",
  warn: "border-amber-500/30 bg-amber-500/8 text-amber-300",
  tip: "border-emerald-500/30 bg-emerald-500/8 text-emerald-300",
};

export function MarketOverviewPanel({
  underlyingSymbol,
  instrumentKey,
  expiry,
  atmStrike,
  daysToExpiry,
  hints,
  onSearchClick,
}: MarketOverviewPanelProps) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl bg-[linear-gradient(180deg,rgba(17,24,39,.75),rgba(8,12,22,.88))] p-3 shadow-[0_10px_35px_rgba(0,0,0,.28)]">
      {/* Chart */}
      <div className="overflow-hidden rounded-xl">
        <CandlestickChart
          symbol={underlyingSymbol}
          headerSymbol={underlyingSymbol}
          instrumentKey={instrumentKey}
          onSearchClick={onSearchClick}
        />
      </div>

      {/* Context pills */}
      <div className="flex flex-wrap gap-2">
        <span className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-slate-300">
          Expiry:{" "}
          <span className="font-semibold text-white">{expiry || "—"}</span>
        </span>
        <span className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-slate-300">
          ATM:{" "}
          <span className="font-semibold text-white">
            {atmStrike ? atmStrike.toLocaleString("en-IN") : "—"}
          </span>
        </span>
        {daysToExpiry !== null && (
          <span
            className={cn(
              "rounded-lg px-2.5 py-1 text-[11px] font-semibold",
              daysToExpiry <= 5
                ? "bg-amber-500/15 text-amber-300"
                : "bg-white/[0.06] text-slate-300"
            )}
          >
            {Math.max(0, daysToExpiry)}d to expiry
          </span>
        )}
      </div>

      {/* Educational hint section */}
      {hints.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
            Market Insights
          </p>
          <div className="space-y-1.5">
            {hints.map((hint) => (
              <div
                key={hint.id}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs leading-relaxed",
                  KIND_STYLES[hint.kind]
                )}
              >
                {hint.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA when nothing is selected */}
      <div className="mt-auto rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center">
        <p className="text-xs text-slate-500">
          Click any{" "}
          <span className="font-semibold text-emerald-400">CE</span> or{" "}
          <span className="font-semibold text-rose-400">PE</span> strike in the
          chain to open the Trade Panel.
        </p>
      </div>
    </div>
  );
}
