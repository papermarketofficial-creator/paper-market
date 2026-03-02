"use client";

import { cn } from "@/lib/utils";

type MobileTradeTopBarProps = {
  instrumentLabel: string;
  ltp?: number;
  changePercent?: number;
  balanceLabel?: string;
  onBuy?: () => void;
  onSell?: () => void;
  className?: string;
};

function formatPrice(value?: number): string {
  if (!Number.isFinite(value) || Number(value) <= 0) return "--";
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatChange(value?: number): string {
  if (!Number.isFinite(value)) return "--";
  const v = Number(value);
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function MobileTradeTopBar({
  instrumentLabel,
  ltp,
  changePercent,
  balanceLabel,
  onBuy,
  onSell,
  className,
}: MobileTradeTopBarProps) {
  const up = Number(changePercent || 0) >= 0;

  return (
    <div
      className={cn(
        "sticky top-0 z-30 border-b border-white/[0.08] bg-[#0d1422]/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-[#0d1422]/80",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{instrumentLabel || "TRADE"}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-xs font-semibold tabular-nums text-slate-200">{formatPrice(ltp)}</span>
            <span className={cn("text-[11px] font-semibold", up ? "text-emerald-400" : "text-rose-400")}>
              {formatChange(changePercent)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onBuy}
            className="min-h-11 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white"
          >
            BUY
          </button>
          <button
            type="button"
            onClick={onSell}
            className="min-h-11 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white"
          >
            SELL
          </button>
        </div>
      </div>

      {balanceLabel ? <p className="mt-1 text-[11px] text-slate-400">Balance: {balanceLabel}</p> : null}
    </div>
  );
}

