"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Stock } from "@/types/equity.types";
import { useTradeExecutionStore } from "@/stores/trading/tradeExecution.store";
import { useWalletStore } from "@/stores/wallet.store";
import { useMarketStore } from "@/stores/trading/market.store";
import { usePositionsStore } from "@/stores/trading/positions.store";
import { X, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { OrderProcessingDialog, TradeConfirmationDialog } from "@/components/trade/form";

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
  const optionType = String(contract.optionType || "").toUpperCase();
  if (optionType === "CE" || optionType === "PE") return optionType;
  return contract.symbol.toUpperCase().includes(" CE") ? "CE" : "PE";
}

function fmtMoney(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "--";
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function OrderPanel({
  contract,
  underlyingPrice,
  daysToExpiry,
  initialSide,
  onClose,
  sheetMode = false,
}: OrderPanelProps) {
  const [side, setSide] = useState<"BUY" | "SELL">(initialSide || "BUY");
  const [lots, setLots] = useState("1");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [limitPrice, setLimitPrice] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    if (initialSide) setSide(initialSide);
  }, [contract.instrumentToken, initialSide]);

  const executeTrade = useTradeExecutionStore((state) => state.executeTrade);
  const isProcessing = useTradeExecutionStore((state) => state.isOrderProcessing);
  const orderProcessingError = useTradeExecutionStore((state) => state.orderProcessingError);
  const clearOrderProcessingError = useTradeExecutionStore((state) => state.clearOrderProcessingError);
  const positions = usePositionsStore((state) => state.positions);
  const balance = useWalletStore((state) => state.availableBalance);

  const livePremium = useMarketStore((state) => {
    const token = contract.instrumentToken;
    if (!token) return 0;
    const price = Number(state.quotesByInstrument[token]?.price);
    return Number.isFinite(price) && price > 0 ? price : 0;
  });

  const optionType = getOptionType(contract);
  const strike = Number(contract.strikePrice || 0);
  const lotSize = Math.max(1, Number(contract.lotSize || 1));

  const contractAny = contract as unknown as Record<string, unknown>;
  const contractFallback =
    Number(contract.price || 0) ||
    Number(contractAny.lastPrice || 0) ||
    Number(contractAny.closePrice || 0) ||
    Number(contractAny.ltp || 0) ||
    0;

  const marketPremium = livePremium > 0 ? livePremium : contractFallback;
  const noPrice = marketPremium <= 0;
  const limitPriceValue = Number(limitPrice) || 0;
  const premium = orderType === "LIMIT" && limitPriceValue > 0 ? limitPriceValue : marketPremium;
  const lotsValue = Math.max(1, Number.parseInt(lots || "1", 10) || 1);

  const existingPosition =
    positions.find((position) => String(position.instrumentToken || "") === contract.instrumentToken) || null;
  const existingSide = existingPosition?.side || null;
  const existingQty = Math.abs(Number(existingPosition?.quantity || 0));
  const isExitFlow =
    existingQty > 0 &&
    ((existingSide === "BUY" && side === "SELL") || (existingSide === "SELL" && side === "BUY"));

  const totalQty = isExitFlow ? existingQty : lotsValue * lotSize;
  const premiumNotional = Math.max(0, premium * totalQty);
  const shortMargin = Math.max(
    premiumNotional * 1.5,
    Math.max(underlyingPrice, strike, 1) * totalQty * 0.15
  );
  const capitalRequired = side === "BUY" ? premiumNotional : shortMargin;
  const breakeven = optionType === "CE" ? strike + premium : strike - premium;
  const maxLoss = side === "BUY" ? premiumNotional : Infinity;
  const insufficientFunds = capitalRequired > balance;

  const isDisabled =
    isProcessing || !contract.instrumentToken || noPrice || totalQty <= 0 || insufficientFunds;

  const handleSubmit = () => {
    if (isDisabled) return;
    if (!contract.instrumentToken) {
      toast.error("Instrument token missing");
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setTimeout(() => {
      setShowConfirmDialog(true);
    }, 50);
  };

  const confirmTrade = async () => {
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

      toast.success(`${side} ${totalQty} x ${contract.symbol}`, {
        description: `Filled at Rs ${premium.toFixed(2)}`,
      });
      clearOrderProcessingError();
      setShowConfirmDialog(false);
    } catch (error) {
      const fallbackMessage = error instanceof Error ? error.message : "Order failed";
      const message = fallbackMessage.includes("PARTIAL_EXIT_NOT_ALLOWED")
        ? "Partial exit is not supported - closes full position."
        : fallbackMessage;
      toast.error("Order rejected", { description: message });
      setShowConfirmDialog(false);
    }
  };

  const isCE = optionType === "CE";

  return (
    <>
      <div className={cn("flex h-full flex-col bg-card", sheetMode && "rounded-none")}>
        <div className="flex shrink-0 items-start justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide",
                  isCE ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                )}
              >
                {optionType}
              </span>
              <p className="truncate text-sm font-semibold text-foreground">{contract.symbol}</p>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Strike {strike > 0 ? strike.toLocaleString("en-IN") : "--"}</span>
              <span>-</span>
              <span>Lot {lotSize}</span>
              {daysToExpiry !== null && daysToExpiry !== undefined && (
                <>
                  <span>-</span>
                  <span className={daysToExpiry <= 3 ? "text-amber-400" : "text-muted-foreground"}>
                    {daysToExpiry}D
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 border-b border-border px-4 py-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">LTP</p>
              <p className="text-xl font-bold tabular-nums text-foreground">{fmtPrice(marketPremium)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Breakeven</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {Number.isFinite(breakeven) ? breakeven.toFixed(2) : "--"}
              </p>
            </div>
          </div>
        </div>

        <div className={cn("flex-1 space-y-3 overflow-y-auto px-4 py-3 [scrollbar-width:thin]", sheetMode && "pb-20")}>
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-background/70">
            {(["BUY", "SELL"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSide(value)}
                className={cn(
                  "py-2 text-sm font-bold transition-all",
                  side === value
                    ? value === "BUY"
                      ? "bg-emerald-600 text-white"
                      : "bg-rose-600 text-white"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {value === "BUY" ? (
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

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Type</span>
            <div className="inline-flex rounded-lg border border-border bg-background/70 p-0.5">
              {(["MARKET", "LIMIT"] as OrderType[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setOrderType(value);
                    if (value === "LIMIT" && marketPremium > 0) {
                      setLimitPrice(marketPremium.toFixed(2));
                    }
                  }}
                  className={cn(
                    "rounded-md px-3 py-1 text-[11px] font-semibold transition-colors",
                    orderType === value
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {orderType === "LIMIT" && (
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">Limit Price (Rs)</label>
              <input
                type="text"
                inputMode="decimal"
                value={limitPrice}
                onChange={(event) => setLimitPrice(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder={marketPremium.toFixed(2)}
                className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-sm font-semibold text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">Lots</label>
              {isExitFlow ? (
                <div className="flex h-9 items-center rounded-lg border border-border bg-background/70 px-3 text-sm font-semibold text-foreground">
                  Exit ({existingQty})
                </div>
              ) : (
                <div className="flex items-center rounded-lg border border-border bg-background/70">
                  <button
                    type="button"
                    onClick={() => setLots(String(Math.max(1, lotsValue - 1)))}
                    className="px-3 py-2 text-muted-foreground hover:text-foreground"
                  >
                    -
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={lots}
                    onChange={(event) => setLots(event.target.value.replace(/[^\d]/g, ""))}
                    className="w-full bg-transparent py-2 text-center text-sm font-bold text-foreground outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setLots(String(lotsValue + 1))}
                    className="px-3 py-2 text-muted-foreground hover:text-foreground"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">Qty</label>
              <div className="flex h-9 items-center rounded-lg border border-border bg-background/70 px-3 text-sm font-bold tabular-nums text-foreground">
                {totalQty.toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border bg-muted/30">
            <div className="px-3 py-2">
              <p className="text-[10px] text-muted-foreground">{side === "BUY" ? "Capital" : "Margin"}</p>
              <p className="mt-0.5 text-xs font-semibold tabular-nums text-foreground">{fmtMoney(capitalRequired)}</p>
            </div>
            <div className="px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Max Loss</p>
              <p className="mt-0.5 text-xs font-semibold tabular-nums text-rose-400">
                {side === "BUY" ? fmtMoney(maxLoss) : "Unlimited"}
              </p>
            </div>
            <div className="px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Lot Size</p>
              <p className="mt-0.5 text-xs font-semibold tabular-nums text-foreground">{lotSize}</p>
            </div>
          </div>

          {side === "SELL" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <p className="text-[11px] leading-relaxed text-amber-300">
                Short options carry unlimited loss risk. Monitor margin closely.
              </p>
            </div>
          )}

          {noPrice && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <p className="text-[11px] leading-relaxed text-amber-300">
                Waiting for live price data. Try clicking the strike row again.
              </p>
            </div>
          )}

          {insufficientFunds && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/8 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
              <p className="text-[11px] text-rose-300">
                Insufficient funds. Required {fmtMoney(capitalRequired)}, available {fmtMoney(balance)}.
              </p>
            </div>
          )}
        </div>

        <div className={cn("shrink-0 border-t border-border p-4", sheetMode && "sticky bottom-0 bg-card")}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isDisabled}
            className={cn(
              "w-full min-h-11 rounded-xl py-3 text-sm font-bold tracking-wide transition-all",
              isDisabled
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : side === "BUY"
                ? "bg-emerald-600 text-white shadow-[0_4px_20px_rgba(16,185,129,.35)] hover:bg-emerald-500"
                : "bg-rose-600 text-white shadow-[0_4px_20px_rgba(239,68,68,.3)] hover:bg-rose-500"
            )}
          >
            {isProcessing
              ? "Placing order..."
              : `${side} ${optionType} - ${totalQty.toLocaleString("en-IN")} qty`}
          </button>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">Paper trading - instant fill</p>
        </div>
      </div>

      <OrderProcessingDialog
        isProcessing={isProcessing}
        errorMessage={orderProcessingError}
        onDismissError={clearOrderProcessingError}
      />

      <TradeConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        selectedStock={contract}
        side={side}
        quantityValue={totalQty}
        currentPrice={premium}
        requiredMargin={capitalRequired}
        productType="CNC"
        leverageValue={1}
        isProcessing={isProcessing}
        onConfirm={confirmTrade}
      />
    </>
  );
}


