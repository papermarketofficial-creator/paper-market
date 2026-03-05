"use client";

import { cn } from "@/lib/utils";
import { Search, ChevronRight } from "lucide-react";

type TradeMode = "single" | "strategy";

type TerminalHeaderProps = {
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

function fmtPrice(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "--";
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtChange(v: number): string {
  if (!Number.isFinite(v)) return "--";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtExpiryLabel(dateKey: string): string {
  if (!dateKey) return "";
  try {
    const d = new Date(dateKey + "T00:00:00");
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }).replace(" ", " ");
  } catch {
    return dateKey;
  }
}

/**
 * Compact terminal-style header strip.
 * Single row on desktop: symbol | price | expiry pills | mode toggle | search.
 */
export function TerminalHeader({
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
}: TerminalHeaderProps) {
  const isUp = underlyingChangePercent >= 0;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-4 py-2">

      {/* Symbol + Price */}
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-sm font-bold text-foreground transition-colors hover:bg-muted"
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          {underlyingLabel || "OPTIONS"}
        </button>

        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold tabular-nums text-foreground">
            {fmtPrice(underlyingPrice)}
          </span>
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              isUp ? "text-emerald-400" : "text-rose-400"
            )}
          >
            {fmtChange(underlyingChangePercent)}
          </span>
        </div>

        {atmStrike && (
          <span className="hidden rounded bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">
            ATM {atmStrike.toLocaleString("en-IN")}
          </span>
        )}
      </div>

      {/* Divider */}
      <ChevronRight className="hidden h-4 w-4 shrink-0 text-border sm:block" />

      {/* Expiry pills */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {expiries.length === 0 ? (
          <span className="text-xs text-muted-foreground">Loading expiries...</span>
        ) : (
          expiries.slice(0, 12).map((exp) => {
            const active = exp === selectedExpiry;
            return (
              <button
                key={exp}
                type="button"
                onClick={() => onExpiryChange(exp)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {fmtExpiryLabel(exp)}
                {active && daysToExpiry !== null && daysToExpiry <= 3 && (
                  <span className="ml-1 text-amber-400">·{daysToExpiry}D</span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Mode toggle + DTE */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {daysToExpiry !== null && (
          <span
            className={cn(
              "hidden rounded px-2 py-0.5 text-[11px] font-semibold sm:inline",
              daysToExpiry <= 3
                ? "bg-amber-500/15 text-amber-400"
                : "bg-muted/60 text-muted-foreground"
            )}
          >
            {Math.max(0, daysToExpiry)}D
          </span>
        )}

        <div className="inline-flex overflow-hidden rounded-lg border border-border bg-background/70">
          <button
            type="button"
            onClick={() => onModeChange("single")}
            className={cn(
              "px-3 py-1.5 text-[11px] font-semibold transition-colors",
              mode === "single"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Single Trade
          </button>
          <button
            type="button"
            onClick={() => onModeChange("strategy")}
            className={cn(
              "px-3 py-1.5 text-[11px] font-semibold transition-colors",
              mode === "strategy"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Strategy
          </button>
        </div>
      </div>
    </div>
  );
}
