"use client";

import { cn } from "@/lib/utils";
import { MousePointerClick } from "lucide-react";

type EmptyPanelProps = {
  underlyingSymbol: string;
  atmStrike: number | null;
  daysToExpiry: number | null;
  onSearchClick: () => void;
};

/**
 * Right panel empty state — shown when no contract is selected.
 * Minimal: just a prompt to select a strike from the chain.
 */
export function EmptyPanel({ underlyingSymbol, atmStrike, daysToExpiry, onSearchClick }: EmptyPanelProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-8 text-center">
      {/* Icon */}
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04]">
        <MousePointerClick className="h-6 w-6 text-slate-500" />
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-300">Select a strike to trade</p>
        <p className="mt-1 text-xs text-slate-600">
          Click any row in the option chain to open the order panel.
        </p>
      </div>

      {/* Context pills */}
      <div className="flex flex-wrap justify-center gap-2">
        {underlyingSymbol && (
          <span className="rounded-md bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-slate-400">
            {underlyingSymbol}
          </span>
        )}
        {atmStrike && (
          <span className="rounded-md bg-[#2d6cff]/10 px-2.5 py-1 text-[11px] font-semibold text-[#8fb3ff]">
            ATM {atmStrike.toLocaleString("en-IN")}
          </span>
        )}
        {daysToExpiry !== null && (
          <span
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-semibold",
              daysToExpiry <= 3
                ? "bg-amber-500/10 text-amber-400"
                : "bg-white/[0.05] text-slate-400"
            )}
          >
            {Math.max(0, daysToExpiry)}D to expiry
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onSearchClick}
        className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        Search contract
      </button>
    </div>
  );
}
