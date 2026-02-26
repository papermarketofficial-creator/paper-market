"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatExpiryLabel } from "@/lib/expiry-utils";
import { Stock } from "@/types/equity.types";
import { toast } from "sonner";
import { useTradeExecutionStore } from "@/stores/trading/tradeExecution.store";
import { useWalletStore } from "@/stores/wallet.store";
import { useMarketStore } from "@/stores/trading/market.store";
import { usePositionsStore } from "@/stores/trading/positions.store";
import {
  LeverageSelector,
  MarginDisplay,
  OrderProcessingDialog,
  OrderTypeToggle,
  PostTradeRiskPreview,
  ProductTypeSelector,
  QuantityInput,
  RiskPreview,
  TradeConfirmationDialog,
} from "@/components/trade/form";
import { InsufficientFundsAlert } from "@/components/wallet/InsufficientFundsAlert";

interface FuturesTradeFormProps {
  selectedStock: Stock | null;
  onStockSelect: (stock: Stock) => void;
  instruments: Stock[];
  onOpenSearch: () => void;
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

export function FuturesTradeForm({
  selectedStock,
  onStockSelect,
  instruments,
  onOpenSearch,
}: FuturesTradeFormProps) {
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("1");
  const [productType, setProductType] = useState<"CNC" | "MIS">("CNC");
  const [leverage, setLeverage] = useState("1");
  const [stopLoss, setStopLoss] = useState("");
  const [target, setTarget] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const executeTrade = useTradeExecutionStore((state) => state.executeTrade);
  const isOrderProcessing = useTradeExecutionStore((state) => state.isOrderProcessing);
  const orderProcessingError = useTradeExecutionStore((state) => state.orderProcessingError);
  const clearOrderProcessingError = useTradeExecutionStore((state) => state.clearOrderProcessingError);
  const fetchWallet = useWalletStore((state) => state.fetchWallet);
  const balance = useWalletStore((state) => state.availableBalance);
  const walletEquity = useWalletStore((state) => state.equity);
  const blockedBalance = useWalletStore((state) => state.blockedBalance);
  const accountState = useWalletStore((state) => state.accountState);
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
    if (currentExpiry && currentExpiry !== selectedExpiry) {
      setSelectedExpiry(currentExpiry);
      return;
    }

    if (!currentExpiry && availableExpiries.length > 0 && !selectedExpiry) {
      setSelectedExpiry(availableExpiries[0].toISOString());
    }
  }, [availableExpiries, selectedExpiry, selectedStock]);

  useEffect(() => {
    if (!selectedStock || !selectedExpiry || instruments.length === 0) return;
    const selectedUnderlying = normalizeUnderlyingKey(selectedStock.name);

    const match = instruments.find(
      (item) =>
        normalizeUnderlyingKey(item.name) === selectedUnderlying &&
        toExpiryIso(item.expiryDate) === selectedExpiry &&
        item.instrumentToken !== selectedStock.instrumentToken
    );

    if (match) {
      onStockSelect(match);
    }
  }, [instruments, onStockSelect, selectedExpiry, selectedStock]);

  const currentPrice =
    liveTokenPrice || chartLastPrice || liveSymbolPrice || liveUnderlyingPrice || selectedStock?.price || 0;
  const leverageValue = parseInt(leverage, 10) || 1;
  const inputValue = parseInt(quantity, 10) || 0;
  const lotSize = selectedStock?.lotSize || 1;
  const totalQuantity = inputValue * lotSize;

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
  const requiredMargin = (currentPrice * effectiveQuantity) / leverageValue;

  const slValue = parseFloat(stopLoss);
  const targetValue = parseFloat(target);
  const hasSl = stopLoss.trim() !== "" && !Number.isNaN(slValue);
  const hasTarget = target.trim() !== "" && !Number.isNaN(targetValue);

  const isSlValid = !hasSl || (side === "BUY" ? slValue < currentPrice : slValue > currentPrice);
  const isTargetValid =
    !hasTarget || (side === "BUY" ? targetValue > currentPrice : targetValue < currentPrice);

  const hasToken = Boolean(selectedStock?.instrumentToken);
  const isQuantityValid = isOppositeExitFlow ? existingPositionQty > 0 : inputValue > 0;
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

  const handleSubmit = () => {
    if (isOrderProcessing) return;
    if (!selectedStock || !canTrade) return;
    if (!selectedStock.instrumentToken) {
      toast.error("Instrument routing key missing");
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setTimeout(() => setShowConfirmDialog(true), 50);
  };

  const confirmTrade = async () => {
    if (isOrderProcessing) return;
    if (!selectedStock?.instrumentToken) {
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
        },
        lotSize,
        "futures"
      );

      toast.success("Trade Sent", {
        description: `${side} ${effectiveQuantity} ${selectedStock.symbol}`,
      });

      setShowConfirmDialog(false);
      setTimeout(() => {
        setQuantity("1");
        setStopLoss("");
        setTarget("");
      }, 300);
    } catch (error) {
      const fallbackMessage = error instanceof Error ? error.message : "Order placement failed";
      const message = fallbackMessage.includes("PARTIAL_EXIT_NOT_ALLOWED")
        ? "Partial exit is disabled in paper trading mode."
        : fallbackMessage;
      toast.error("Order Failed", { description: message });
    }
  };

  return (
    <TooltipProvider>
      <div className="h-full min-h-0 border border-white/[0.06] bg-[#0d1422] flex flex-col">
        <div className="shrink-0 p-3 border-b border-white/[0.06]">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
              Futures Order
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px] border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.08]"
              onClick={onOpenSearch}
            >
              <Search className="h-3.5 w-3.5 mr-1.5" />
              Search
            </Button>
          </div>
        </div>

        <div className="space-y-3 p-3 flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin]">
          {!selectedStock ? (
            <div className="h-full min-h-[220px] border border-white/[0.06] bg-[#0b1120] p-4 flex flex-col">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-white">Select a futures contract</h3>
                <p className="text-xs text-slate-400">
                  Search by symbol and choose an expiry to start placing orders.
                </p>
                <p className="text-[11px] text-slate-500">
                  Supports index and stock futures with live margin preview.
                </p>
              </div>

              <div className="mt-4 space-y-1.5 text-[11px] text-slate-400">
                <p>• Contract details and expiry controls</p>
                <p>• Order side, quantity, SL and target</p>
                <p>• Margin and post-trade risk checks</p>
              </div>

              <Button
                type="button"
                className="mt-auto h-9 text-xs font-semibold bg-[#2d6cff] hover:bg-[#3c76ff] text-white"
                onClick={onOpenSearch}
              >
                <Search className="mr-1.5 h-3.5 w-3.5" />
                Search Futures Contract
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3 bg-[#0b1120] p-3 border border-white/[0.06]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                      Selected Contract
                    </p>
                    <p className="text-sm font-bold text-white mt-1">{selectedStock.symbol}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.08]"
                    onClick={onOpenSearch}
                  >
                    Change
                  </Button>
                </div>

                {availableExpiries.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Expiry
                    </Label>
                    <Select value={selectedExpiry} onValueChange={setSelectedExpiry}>
                      <SelectTrigger className="bg-[#0f172a] border-white/[0.1] h-8 rounded-sm text-xs">
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

              <div className="flex items-center justify-between border border-white/[0.06] bg-[#0b1120] px-3 py-2">
                <span className="text-sm font-bold text-slate-300">{selectedStock.symbol}</span>
                <span className={cn("text-lg font-bold font-mono", selectedStock.change >= 0 ? "text-trade-buy" : "text-trade-sell")}>
                  Rs {currentPrice.toLocaleString()}
                </span>
              </div>

              <OrderTypeToggle side={side} onSideChange={setSide} />
              {isOppositeExitFlow ? (
                <div className="space-y-2 rounded-sm border border-border bg-muted/20 p-3">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Exit Full Position
                  </Label>
                  <p className="text-sm font-semibold text-foreground">
                    Position: {existingPositionQty} units
                  </p>
                  <p className="text-xs text-muted-foreground">Exit: {existingPositionQty} units only</p>
                </div>
              ) : (
                <QuantityInput quantity={quantity} onQuantityChange={setQuantity} lotSize={lotSize} />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">Stop Loss</Label>
                  <Input
                    type="number"
                    placeholder={side === "BUY" ? "< Entry" : "> Entry"}
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    className={cn(
                      "bg-input border-border h-8 rounded-sm text-xs font-mono",
                      hasSl && !isSlValid && "border-trade-sell focus-visible:ring-trade-sell"
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">Target</Label>
                  <Input
                    type="number"
                    placeholder={side === "BUY" ? "> Entry" : "< Entry"}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className={cn(
                      "bg-input border-border h-8 rounded-sm text-xs font-mono",
                      hasTarget && !isTargetValid && "border-trade-sell focus-visible:ring-trade-sell"
                    )}
                  />
                </div>
              </div>

              <RiskPreview
                selectedStock={selectedStock}
                quantityValue={inputValue}
                currentPrice={currentPrice}
                balance={balance}
              />

              <ProductTypeSelector productType={productType} onProductTypeChange={setProductType} />
              <LeverageSelector leverage={leverage} onLeverageChange={setLeverage} />
              <MarginDisplay
                selectedStock={selectedStock}
                currentPrice={currentPrice}
                requiredMargin={requiredMargin}
                balance={balance}
              />
              <PostTradeRiskPreview
                projectedAdditionalMargin={requiredMargin}
                equity={walletEquity}
                blockedMargin={blockedBalance}
                accountState={accountState}
              />
              <InsufficientFundsAlert requiredAmount={requiredMargin} />

              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canTrade}
                className={cn(
                  "w-full h-9 text-sm font-bold uppercase tracking-widest rounded-sm",
                  side === "BUY"
                    ? "bg-trade-buy hover:bg-trade-buy/90 text-white"
                    : "bg-trade-sell hover:bg-trade-sell/90 text-white"
                )}
              >
                {side} {selectedStock.symbol}
              </Button>
            </>
          )}
        </div>
      </div>

      <OrderProcessingDialog
        isProcessing={isOrderProcessing}
        errorMessage={orderProcessingError}
        onDismissError={clearOrderProcessingError}
      />

      <TradeConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        selectedStock={selectedStock}
        side={side}
        quantityValue={totalQuantity}
        currentPrice={currentPrice}
        requiredMargin={requiredMargin}
        productType={productType}
        leverageValue={leverageValue}
        isProcessing={isOrderProcessing}
        onConfirm={confirmTrade}
      />
    </TooltipProvider>
  );
}
