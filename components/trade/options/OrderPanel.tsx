"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Stock } from "@/types/equity.types";
import { useTradeExecutionStore } from "@/stores/trading/tradeExecution.store";
import { useWalletStore } from "@/stores/wallet.store";
import { useMarketStore } from "@/stores/trading/market.store";
import { usePositionsStore } from "@/stores/trading/positions.store";
import { X, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

type OrderType = "MARKET" | "LIMIT";

type OrderPanelProps = {
  contract: Stock;
  underlyingPrice: number;
  daysToExpiry?: number | null;
  initialSide?: "BUY" | "SELL";
  onClose: () => void;
  sheetMode?: boolean;
};

function getOptionType(contract: Stock): "CE" | "PE" {
  const ot = String(contract.optionType || "").toUpperCase();
  if (ot === "CE" || ot === "PE") return ot;
  return contract.symbol.toUpperCase().includes(" CE") ? "CE" : "PE";
}

function fmtMoney(v: number): string {
  if (!Number.isFinite(v)) return "--";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtPrice(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "--";
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Clean, professional order panel — Zerodha/Upstox style.
 * No modals. No confirmations. Instant paper execution.
 */
export function OrderPanel({ contract, underlyingPrice, daysToExpiry, initialSide, onClose, sheetMode = false }: OrderPanelProps) {
  const [side, setSide] = useState<"BUY" | "SELL">(initialSide || "BUY");
  const [lots, setLots] = useState("1");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [limitPrice, setLimitPrice] = useState("");

  // Update side if initialSide changes
  useEffect(() => {
    if (initialSide) setSide(initialSide);
  }, [contract.instrumentToken, initialSide]);

  const executeTrade = useTradeExecutionStore((s) => s.executeTrade);
  const isProcessing = useTradeExecutionStore((s) => s.isOrderProcessing);
  const clearError = useTradeExecutionStore((s) => s.clearOrderProcessingError);
  const positions = usePositionsStore((s) => s.positions);
  const balance = useWalletStore((s) => s.availableBalance);

  const livePremium = useMarketStore((s) => {
    const token = contract.instrumentToken;
    if (!token) return 0;
    const v = Number(s.quotesByInstrument[token]?.price);
    return Number.isFinite(v) && v > 0 ? v : 0;
  });

  const optionType = getOptionType(contract);
  const strike = Number(contract.strikePrice || 0);
  const lotSize = Math.max(1, Number(contract.lotSize || 1));

  // Priority: live WebSocket quote → price injected from chain row → any other field on Stock
  const contractAny = contract as unknown as Record<string, unknown>;
  const contractFallback =
    Number(contract.price || 0) ||
    Number(contractAny.lastPrice || 0) ||
    Number(contractAny.closePrice || 0) ||
    Number(contractAny.ltp || 0) ||
    0;
  const marketPremium = livePremium > 0 ? livePremium : contractFallback;
  const noPrice = marketPremium <= 0;
  const limitPriceVal = Number(limitPrice) || 0;
  const premium = orderType === "LIMIT" && limitPriceVal > 0 ? limitPriceVal : marketPremium;
  const lotsVal = Math.max(1, parseInt(lots || "1", 10) || 1);

  // Existing position check for exit flow
  const existingPos = positions.find(
    (p) => String(p.instrumentToken || "") === contract.instrumentToken
  ) || null;
  const existingSide = existingPos?.side || null;
  const existingQty = Math.abs(Number(existingPos?.quantity || 0));
  const isExitFlow =
    existingQty > 0 &&
    ((existingSide === "BUY" && side === "SELL") || (existingSide === "SELL" && side === "BUY"));

  const totalQty = isExitFlow ? existingQty : lotsVal * lotSize;
  const premiumNtl = Math.max(0, premium * totalQty);
  const shortMargin = Math.max(
    premiumNtl * 1.5,
    Math.max(underlyingPrice, strike, 1) * totalQty * 0.15
  );
  const capitalRequired = side === "BUY" ? premiumNtl : shortMargin;
  const breakeven = optionType === "CE" ? strike + premium : strike - premium;
  const maxLoss = side === "BUY" ? premiumNtl : Infinity;
  const insufficientFunds = capitalRequired > balance;

  const isDisabled =
    isProcessing ||
    !contract.instrumentToken ||
    noPrice ||
    totalQty <= 0 ||
    insufficientFunds;

  const handleExecute = async () => {
    if (!contract.instrumentToken) {
      toast.error("Instrument token missing");
      return;
    }
    try {
      await executeTrade(
        {
          instrumentToken: contract.instrumentToken,
          symbol: contract.symbol,
          side,
          quantity: totalQty,
          entryPrice: premium,
        },
        lotSize,
        "options",
        orderType
      );
      toast.success(`${side} ${totalQty} × ${contract.symbol}`, {
        description: `Filled at ₹${premium.toFixed(2)}`,
      });
      clearError();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Order failed";
      const normalized = msg.includes("PARTIAL_EXIT_NOT_ALLOWED")
        ? "Partial exit is not supported — closes full position."
        : msg;
      toast.error("Order rejected", { description: normalized });
    }
  };

  const isCE = optionType === "CE";
  const buyActive = side === "BUY";

  return (
    <div className={cn("flex h-full flex-col bg-[#0d1422]", sheetMode && "rounded-none")}>
      {/* ── Header ── */}
      <div className="flex shrink-0 items-start justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide",
                isCE
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-rose-500/20 text-rose-400"
              )}
            >
              {optionType}
            </span>
            <p className="truncate text-sm font-semibold text-white">{contract.symbol}</p>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
            <span>Strike {strike > 0 ? strike.toLocaleString("en-IN") : "--"}</span>
            <span>·</span>
            <span>Lot {lotSize}</span>
            {daysToExpiry !== null && daysToExpiry !== undefined && (
              <>
                <span>·</span>
                <span className={daysToExpiry <= 3 ? "text-amber-400" : "text-slate-400"}>
                  {daysToExpiry}D
                </span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── LTP strip ── */}
      <div className="shrink-0 border-b border-white/[0.04] px-4 py-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500">LTP</p>
            <p className="text-xl font-bold tabular-nums text-white">
              {fmtPrice(marketPremium)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-500">Breakeven</p>
            <p className="text-sm font-semibold tabular-nums text-slate-200">
              {Number.isFinite(breakeven) ? breakeven.toFixed(2) : "--"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className={cn("flex-1 space-y-3 overflow-y-auto px-4 py-3 [scrollbar-width:thin]", sheetMode && "pb-20")}>

        {/* BUY / SELL tabs */}
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03]">
          {(["BUY", "SELL"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={cn(
                "py-2 text-sm font-bold transition-all",
                side === s
                  ? s === "BUY"
                    ? "bg-emerald-600 text-white"
                    : "bg-rose-600 text-white"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              {s === "BUY" ? (
                <span className="flex items-center justify-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> BUY
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1">
                  <TrendingDown className="h-3.5 w-3.5" /> SELL
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Order type */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">Type</span>
          <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
            {(["MARKET", "LIMIT"] as OrderType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setOrderType(t);
                  if (t === "LIMIT" && marketPremium > 0) {
                    setLimitPrice(marketPremium.toFixed(2));
                  }
                }}
                className={cn(
                  "rounded-md px-3 py-1 text-[11px] font-semibold transition-colors",
                  orderType === t
                    ? "bg-white/[0.1] text-white"
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Limit price input */}
        {orderType === "LIMIT" && (
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Limit Price (₹)</label>
            <input
              type="text"
              inputMode="decimal"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder={marketPremium.toFixed(2)}
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white placeholder-slate-600 outline-none focus:border-[#2d6cff]/50 focus:ring-1 focus:ring-[#2d6cff]/30"
            />
          </div>
        )}

        {/* Lots + qty */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Lots</label>
            {isExitFlow ? (
              <div className="flex h-9 items-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-sm font-semibold text-slate-300">
                Exit ({existingQty})
              </div>
            ) : (
              <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setLots(String(Math.max(1, lotsVal - 1)))}
                  className="px-3 py-2 text-slate-400 hover:text-white"
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={lots}
                  onChange={(e) => setLots(e.target.value.replace(/[^\d]/g, ""))}
                  className="w-full bg-transparent py-2 text-center text-sm font-bold text-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => setLots(String(lotsVal + 1))}
                  className="px-3 py-2 text-slate-400 hover:text-white"
                >
                  +
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">Qty</label>
            <div className="flex h-9 items-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-sm font-bold tabular-nums text-white">
              {totalQty.toLocaleString("en-IN")}
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-3 divide-x divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <div className="px-3 py-2">
            <p className="text-[10px] text-slate-500">{side === "BUY" ? "Capital" : "Margin"}</p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-white">
              {fmtMoney(capitalRequired)}
            </p>
          </div>
          <div className="px-3 py-2">
            <p className="text-[10px] text-slate-500">Max Loss</p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-rose-400">
              {side === "BUY" ? fmtMoney(maxLoss) : "∞"}
            </p>
          </div>
          <div className="px-3 py-2">
            <p className="text-[10px] text-slate-500">Lot Size</p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-slate-300">{lotSize}</p>
          </div>
        </div>

        {/* SELL risk warning */}
        {side === "SELL" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <p className="text-[11px] leading-relaxed text-amber-300">
              Short options carry unlimited loss risk. Monitor margin closely.
            </p>
          </div>
        )}

        {/* No price data warning */}
        {noPrice && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <p className="text-[11px] leading-relaxed text-amber-300">
              Waiting for live price data. Try clicking the strike row again.
            </p>
          </div>
        )}

        {/* Insufficient funds */}
        {insufficientFunds && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/8 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
            <p className="text-[11px] text-rose-300">
              Insufficient funds. Required {fmtMoney(capitalRequired)}, available{" "}
              {fmtMoney(balance)}.
            </p>
          </div>
        )}
      </div>

      {/* ── Execute button (sticky bottom) ── */}
      <div className={cn("shrink-0 border-t border-white/[0.06] p-4", sheetMode && "sticky bottom-0 bg-[#0d1422]")}>
        <button
          type="button"
          onClick={handleExecute}
          disabled={isDisabled}
          className={cn(
            "w-full min-h-11 rounded-xl py-3 text-sm font-bold tracking-wide transition-all",
            isDisabled
              ? "cursor-not-allowed bg-white/[0.06] text-slate-600"
              : side === "BUY"
              ? "bg-emerald-600 text-white shadow-[0_4px_20px_rgba(16,185,129,.35)] hover:bg-emerald-500"
              : "bg-rose-600 text-white shadow-[0_4px_20px_rgba(239,68,68,.3)] hover:bg-rose-500"
          )}
        >
          {isProcessing
            ? "Placing order…"
            : `${side} ${optionType} · ${totalQty.toLocaleString("en-IN")} qty`}
        </button>
        <p className="mt-2 text-center text-[10px] text-slate-600">
          Paper trading · instant fill
        </p>
      </div>
    </div>
  );
}
