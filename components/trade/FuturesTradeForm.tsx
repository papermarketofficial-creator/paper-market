"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatExpiryLabel } from "@/lib/expiry-utils";
import { calculateFuturesRequiredMargin } from "@/lib/trading/futures-margin";
import { Stock } from "@/types/equity.types";
import { toast } from "sonner";
import { useTradeExecutionStore } from "@/stores/trading/tradeExecution.store";
import { useWalletStore } from "@/stores/wallet.store";
import { useMarketStore } from "@/stores/trading/market.store";
import { usePositionsStore } from "@/stores/trading/positions.store";

interface FuturesTradeFormProps {
  selectedStock: Stock | null;
  onStockSelect: (stock: Stock) => void;
  instruments: Stock[];
  onOpenSearch: () => void;
  isBootstrapping?: boolean;
  sheetMode?: boolean;
}

function parseExpiryDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function toExpiryIso(value: unknown): string {
  const parsed = parseExpiryDate(value);
  return parsed ? parsed.toISOString() : "";
}

function normalizeUnderlyingKey(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "--";
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function FuturesTradeForm({
  selectedStock,
  onStockSelect,
  instruments,
  onOpenSearch,
  isBootstrapping = false,
  sheetMode = false,
}: FuturesTradeFormProps) {
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("1");
  const [productType, setProductType] = useState<"CNC" | "MIS">("CNC");
  const [leverage, setLeverage] = useState("1");
  const [stopLoss, setStopLoss] = useState("");
  const [target, setTarget] = useState("");

  const executeTrade = useTradeExecutionStore((state) => state.executeTrade);
  const isOrderProcessing = useTradeExecutionStore((state) => state.isOrderProcessing);
  const orderProcessingError = useTradeExecutionStore((state) => state.orderProcessingError);
  const clearOrderProcessingError = useTradeExecutionStore((state) => state.clearOrderProcessingError);

  const fetchWallet = useWalletStore((state) => state.fetchWallet);
  const balance = useWalletStore((state) => state.availableBalance);
  const walletEquity = useWalletStore((state) => state.equity);
  const blockedBalance = useWalletStore((state) => state.blockedBalance);

  const positions = usePositionsStore((state) => state.positions);
  const fetchPositions = usePositionsStore((state) => state.fetchPositions);

  const liveTokenPrice = useMarketStore((state) => {
    const token = selectedStock?.instrumentToken;
    if (!token) return 0;
    const price = Number(state.quotesByInstrument[token]?.price);
    return Number.isFinite(price) && price > 0 ? price : 0;
  });

  const liveSymbolPrice = useMarketStore((state) => {
    const symbol = selectedStock?.symbol;
    if (!symbol) return 0;
    const price = Number(state.selectPrice(symbol));
    return Number.isFinite(price) && price > 0 ? price : 0;
  });

  const liveUnderlyingPrice = useMarketStore((state) => {
    const underlying = selectedStock?.name;
    if (!underlying) return 0;
    const price = Number(state.selectPrice(underlying));
    return Number.isFinite(price) && price > 0 ? price : 0;
  });

  const chartLastPrice = useMarketStore((state) => {
    const token = selectedStock?.instrumentToken;
    if (!token) return 0;
    const activeKey = String(state.simulatedInstrumentKey || "");
    if (activeKey !== token) return 0;
    const last = state.historicalData?.[state.historicalData.length - 1];
    const close = Number(last?.close);
    return Number.isFinite(close) && close > 0 ? close : 0;
  });

  useEffect(() => {
    fetchWallet().catch(() => undefined);
  }, [fetchWallet]);

  useEffect(() => {
    fetchPositions(true).catch(() => undefined);
  }, [fetchPositions]);

  const availableExpiries = useMemo(() => {
    const dates = instruments
      .map((item) => parseExpiryDate(item.expiryDate))
      .filter((date): date is Date => Boolean(date));

    return Array.from(new Set(dates.map((d) => d.getTime())))
      .map((time) => new Date(time))
      .sort((a, b) => a.getTime() - b.getTime());
  }, [instruments]);

  useEffect(() => {
    if (!selectedStock) {
      setSelectedExpiry("");
      return;
    }

    const currentExpiry = toExpiryIso(selectedStock.expiryDate);
    if (currentExpiry) {
      setSelectedExpiry((prev) => (prev === currentExpiry ? prev : currentExpiry));
      return;
    }

    if (availableExpiries.length > 0) {
      const fallbackExpiry = availableExpiries[0].toISOString();
      setSelectedExpiry((prev) => (prev === fallbackExpiry ? prev : fallbackExpiry));
    }
  }, [availableExpiries, selectedStock]);

  useEffect(() => {
    if (!selectedStock || !selectedExpiry || instruments.length === 0) return;
    const currentExpiry = toExpiryIso(selectedStock.expiryDate);
    if (currentExpiry === selectedExpiry) return;

    const selectedUnderlying = normalizeUnderlyingKey(selectedStock.name);
    const candidates = instruments.filter(
      (item) =>
        normalizeUnderlyingKey(item.name) === selectedUnderlying && toExpiryIso(item.expiryDate) === selectedExpiry
    );
    if (candidates.length === 0) return;

    const match = candidates.find((item) => item.symbol === selectedStock.symbol) ?? candidates[0];
    if (match.instrumentToken !== selectedStock.instrumentToken) {
      onStockSelect(match);
    }
  }, [instruments, onStockSelect, selectedExpiry, selectedStock]);

  const currentPrice =
    liveTokenPrice || chartLastPrice || liveSymbolPrice || liveUnderlyingPrice || selectedStock?.price || 0;

  const leverageValue = parseInt(leverage, 10) || 1;
  const inputLots = Math.max(1, parseInt(quantity, 10) || 1);
  const lotSize = selectedStock?.lotSize || 1;
  const totalQuantity = inputLots * lotSize;

  const existingPosition = useMemo(() => {
    const token = selectedStock?.instrumentToken;
    if (!token) return null;
    return (
      positions.find(
        (position) =>
          String(position.instrumentToken || "") === token &&
          Number(position.quantity || 0) > 0
      ) || null
    );
  }, [positions, selectedStock?.instrumentToken]);

  const existingPositionQty = existingPosition ? Math.abs(Number(existingPosition.quantity || 0)) : 0;
  const existingPositionSide = existingPosition?.side || null;
  const isOppositeExitFlow =
    existingPositionQty > 0 &&
    ((existingPositionSide === "BUY" && side === "SELL") ||
      (existingPositionSide === "SELL" && side === "BUY"));

  const effectiveQuantity = isOppositeExitFlow ? existingPositionQty : totalQuantity;
  const requiredMargin = calculateFuturesRequiredMargin({
    price: currentPrice,
    quantity: effectiveQuantity,
    leverage: leverageValue,
    instrument: {
      underlying: selectedStock?.name,
      name: selectedStock?.name,
      tradingsymbol: selectedStock?.symbol,
      symbol: selectedStock?.symbol,
    },
  });

  const slValue = parseFloat(stopLoss);
  const targetValue = parseFloat(target);
  const hasSl = stopLoss.trim() !== "" && !Number.isNaN(slValue);
  const hasTarget = target.trim() !== "" && !Number.isNaN(targetValue);

  const isSlValid = !hasSl || (side === "BUY" ? slValue < currentPrice : slValue > currentPrice);
  const isTargetValid = !hasTarget || (side === "BUY" ? targetValue > currentPrice : targetValue < currentPrice);

  const hasToken = Boolean(selectedStock?.instrumentToken);
  const isQuantityValid = isOppositeExitFlow ? existingPositionQty > 0 : inputLots > 0;
  const hasValidPrice = Number.isFinite(currentPrice) && currentPrice > 0;
  const hasSufficientMargin = requiredMargin <= balance;

  const canTrade =
    Boolean(selectedStock) &&
    hasToken &&
    hasValidPrice &&
    !isOrderProcessing &&
    isQuantityValid &&
    hasSufficientMargin &&
    isSlValid &&
    isTargetValid;

  const handleExecute = async () => {
    if (isOrderProcessing || !selectedStock || !canTrade) return;
    if (!selectedStock.instrumentToken) {
      toast.error("Instrument routing key missing");
      return;
    }

    try {
      await executeTrade(
        {
          instrumentToken: selectedStock.instrumentToken,
          symbol: selectedStock.symbol,
          side,
          quantity: effectiveQuantity,
          entryPrice: currentPrice,
          leverage: leverageValue,
        },
        lotSize,
        "futures"
      );

      toast.success("Trade Sent", {
        description: `${side} ${effectiveQuantity} ${selectedStock.symbol}`,
      });

      clearOrderProcessingError();
      setQuantity("1");
      setStopLoss("");
      setTarget("");
    } catch (error) {
      const fallbackMessage = error instanceof Error ? error.message : "Order placement failed";
      const message = fallbackMessage.includes("PARTIAL_EXIT_NOT_ALLOWED")
        ? "Partial exit is disabled in paper trading mode."
        : fallbackMessage;
      toast.error("Order Failed", { description: message });
    }
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-[#0d1422]", sheetMode && "rounded-none")}>
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Futures Order
        </div>
        <button
          type="button"
          onClick={onOpenSearch}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/[0.08]"
        >
          <Search className="h-3 w-3" />
          Search
        </button>
      </div>

      <div className={cn("flex-1 space-y-3 overflow-y-auto px-4 py-3 [scrollbar-width:thin]", sheetMode && "pb-20")}>
        {!selectedStock ? (
          <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-white/[0.06] bg-[#0b1120]">
            {isBootstrapping ? (
              <div className="text-center">
                <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-[#2d6cff]/50 border-t-[#2d6cff]" />
                <p className="text-sm font-semibold text-white">Loading default NIFTY future...</p>
                <p className="mt-1 text-xs text-slate-500">Preparing contracts and live chart.</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-semibold text-white">No contract selected</p>
                <p className="mt-1 text-xs text-slate-500">Search and select a futures contract.</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#0b1120] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Selected Contract</p>
                  <p className="mt-1 text-sm font-bold text-white">{selectedStock.symbol}</p>
                </div>
               
              </div>

              {availableExpiries.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Expiry</p>
                  <Select value={selectedExpiry} onValueChange={setSelectedExpiry}>
                    <SelectTrigger className="h-8 rounded-md border-white/[0.1] bg-[#0f172a] text-xs">
                      <SelectValue placeholder="Select Expiry" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableExpiries.map((exp) => (
                        <SelectItem key={exp.toISOString()} value={exp.toISOString()}>
                          {formatExpiryLabel(exp)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#0b1120] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">LTP</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-lg font-bold tabular-nums text-white">{formatPrice(currentPrice)}</span>
                <span className={cn("text-xs font-semibold", side === "BUY" ? "text-emerald-400" : "text-rose-400")}>
                  {side}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03]">
              {(["BUY", "SELL"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSide(value)}
                  className={cn(
                    "py-2 text-sm font-bold transition-colors",
                    side === value
                      ? value === "BUY"
                        ? "bg-emerald-600 text-white"
                        : "bg-rose-600 text-white"
                      : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {value === "BUY" ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {value}
                  </span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Lots</p>
                {isOppositeExitFlow ? (
                  <div className="flex h-9 items-center rounded-md border border-white/[0.08] bg-white/[0.03] px-3 text-sm font-semibold text-slate-200">
                    Exit ({existingPositionQty})
                  </div>
                ) : (
                  <div className="flex items-center overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.03]">
                    <button
                      type="button"
                      onClick={() => setQuantity(String(Math.max(1, inputLots - 1)))}
                      className="px-3 py-2 text-slate-400 hover:text-white"
                    >
                      -
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ""))}
                      className="w-full bg-transparent py-2 text-center text-sm font-bold text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity(String(inputLots + 1))}
                      className="px-3 py-2 text-slate-400 hover:text-white"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Quantity</p>
                <div className="flex h-9 items-center rounded-md border border-white/[0.08] bg-white/[0.03] px-3 text-sm font-bold tabular-nums text-white">
                  {effectiveQuantity.toLocaleString("en-IN")}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Product</p>
                <div className="inline-flex w-full rounded-md border border-white/[0.08] bg-white/[0.03] p-0.5">
                  {(["CNC", "MIS"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setProductType(value)}
                      className={cn(
                        "w-1/2 rounded-sm py-1.5 text-[11px] font-semibold",
                        productType === value ? "bg-white/[0.12] text-white" : "text-slate-500 hover:text-slate-300"
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Leverage</p>
                <div className="inline-flex w-full rounded-md border border-white/[0.08] bg-white/[0.03] p-0.5">
                  {["1", "2", "3", "5"].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLeverage(value)}
                      className={cn(
                        "w-1/4 rounded-sm py-1.5 text-[11px] font-semibold",
                        leverage === value ? "bg-white/[0.12] text-white" : "text-slate-500 hover:text-slate-300"
                      )}
                    >
                      {value}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Stop Loss</p>
                <input
                  type="number"
                  placeholder={side === "BUY" ? "< Entry" : "> Entry"}
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  className={cn(
                    "h-9 w-full rounded-md border bg-white/[0.03] px-3 text-sm font-mono text-white placeholder:text-slate-600 outline-none",
                    hasSl && !isSlValid
                      ? "border-rose-500/60 focus:ring-1 focus:ring-rose-500/40"
                      : "border-white/[0.1] focus:ring-1 focus:ring-[#2d6cff]/40"
                  )}
                />
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Target</p>
                <input
                  type="number"
                  placeholder={side === "BUY" ? "> Entry" : "< Entry"}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className={cn(
                    "h-9 w-full rounded-md border bg-white/[0.03] px-3 text-sm font-mono text-white placeholder:text-slate-600 outline-none",
                    hasTarget && !isTargetValid
                      ? "border-rose-500/60 focus:ring-1 focus:ring-rose-500/40"
                      : "border-white/[0.1] focus:ring-1 focus:ring-[#2d6cff]/40"
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
              <div className="px-3 py-2">
                <p className="text-[10px] text-slate-500">Required</p>
                <p className="mt-0.5 text-xs font-semibold tabular-nums text-white">{formatMoney(requiredMargin)}</p>
              </div>
              <div className="px-3 py-2">
                <p className="text-[10px] text-slate-500">Available</p>
                <p className="mt-0.5 text-xs font-semibold tabular-nums text-slate-300">{formatMoney(balance)}</p>
              </div>
              <div className="px-3 py-2">
                <p className="text-[10px] text-slate-500">Blocked</p>
                <p className="mt-0.5 text-xs font-semibold tabular-nums text-slate-300">{formatMoney(blockedBalance)}</p>
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-slate-400">
              Account Equity: <span className="font-semibold text-slate-200">{formatMoney(walletEquity)}</span>
            </div>

            {(!isSlValid || !isTargetValid) && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <p className="text-[11px] leading-relaxed text-amber-300">
                  Check SL/Target levels relative to entry price before placing the order.
                </p>
              </div>
            )}

            {!hasSufficientMargin && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/8 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                <p className="text-[11px] leading-relaxed text-rose-300">
                  Insufficient funds. Required {formatMoney(requiredMargin)}, available {formatMoney(balance)}.
                </p>
              </div>
            )}

            {orderProcessingError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/8 px-3 py-2 text-[11px] text-rose-300">
                {orderProcessingError}
              </div>
            )}
          </>
        )}
      </div>

      {selectedStock && (
        <div className={cn("shrink-0 border-t border-white/[0.06] p-4", sheetMode && "sticky bottom-0 bg-[#0d1422]")}>
          <button
            type="button"
            onClick={handleExecute}
            disabled={!canTrade}
            className={cn(
              "w-full min-h-11 rounded-xl py-3 text-sm font-bold tracking-wide transition-all",
              !canTrade
                ? "cursor-not-allowed bg-white/[0.06] text-slate-600"
                : side === "BUY"
                ? "bg-emerald-600 text-white shadow-[0_4px_20px_rgba(16,185,129,.35)] hover:bg-emerald-500"
                : "bg-rose-600 text-white shadow-[0_4px_20px_rgba(239,68,68,.3)] hover:bg-rose-500"
            )}
          >
            {isOrderProcessing
              ? "Placing order..."
              : isOppositeExitFlow
              ? `${side} EXIT | ${effectiveQuantity.toLocaleString("en-IN")} qty`
              : `${side} ${selectedStock.symbol} | ${effectiveQuantity.toLocaleString("en-IN")} qty`}
          </button>
          <p className="mt-2 text-center text-[10px] text-slate-600">Paper trading | instant fill</p>
        </div>
      )}
    </div>
  );
}
