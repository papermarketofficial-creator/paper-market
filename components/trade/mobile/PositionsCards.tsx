"use client";

import { useEffect, useMemo } from "react";
import { usePositionsStore } from "@/stores/trading/positions.store";
import { cn } from "@/lib/utils";

type PositionsCardsProps = {
  className?: string;
  instrumentFilter?: "equity" | "futures" | "options";
};

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function PositionsCards({ className, instrumentFilter }: PositionsCardsProps) {
  const positions = usePositionsStore((state) => state.positions);
  const isLoading = usePositionsStore((state) => state.isLoading);
  const fetchPositions = usePositionsStore((state) => state.fetchPositions);
  const closePosition = usePositionsStore((state) => state.closePosition);

  useEffect(() => {
    fetchPositions(true).catch(() => undefined);
  }, [fetchPositions]);

  const filtered = useMemo(() => {
    return positions.filter((position) => {
      if (Number(position.quantity || 0) === 0) return false;
      if (!instrumentFilter) return true;
      return position.instrument === instrumentFilter;
    });
  }, [instrumentFilter, positions]);

  return (
    <div className={cn("h-full overflow-y-auto px-3 py-3", className)}>
      <div className="space-y-3">
        {isLoading && filtered.length === 0 ? (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-slate-500">
            Loading positions...
          </div>
        ) : null}

        {!isLoading && filtered.length === 0 ? (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-slate-500">
            No open positions.
          </div>
        ) : null}

        {filtered.map((position) => {
          const pnl = Number(position.currentPnL || 0);
          const pnlUp = pnl >= 0;
          return (
            <article key={position.id} className="rounded-lg border border-white/[0.08] bg-[#0f172a] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{position.symbol}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {position.side} · Qty {Math.abs(Number(position.quantity || 0)).toLocaleString("en-IN")}
                  </p>
                </div>
                <p className={cn("text-sm font-semibold tabular-nums", pnlUp ? "text-emerald-400" : "text-rose-400")}>
                  {pnlUp ? "+" : ""}
                  {formatMoney(pnl)}
                </p>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                <span>Entry: {Number(position.entryPrice || 0).toFixed(2)}</span>
                <span className="text-right">LTP: {Number(position.currentPrice || 0).toFixed(2)}</span>
              </div>

              <button
                type="button"
                onClick={() => closePosition(position.id)}
                className="mt-3 min-h-11 w-full rounded-md border border-rose-500/40 bg-rose-500/10 text-xs font-semibold text-rose-300"
              >
                Close Position
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

