"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { Stock } from "@/types/equity.types";
import { useTradeExecutionStore } from "@/stores/trading/tradeExecution.store";
import { useWalletStore } from "@/stores/wallet.store";
import { useMarketStore } from "@/stores/trading/market.store";
import { usePositionsStore } from "@/stores/trading/positions.store";
import { useLearningModeStore } from "@/stores/options/learning-mode.store";
import { TradeOutcomeSimulator } from "@/components/trade/options/TradeOutcomeSimulator";
import { OptionPayoffChart } from "@/components/trade/options/OptionPayoffChart";
import { getContextHints, OptionHint } from "@/lib/options/option-hints";
import { AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import { toast } from "sonner";

type OrderType = "MARKET" | "LIMIT";

type OptionTradePanelProps = {
  contract: Stock;
  underlyingPrice: number;
  daysToExpiry?: number | null;
  onClose: () => void;
};

function getOptionType(contract: Stock): "CE" | "PE" {
  const optionType = String(contract.optionType || "").toUpperCase();
  if (optionType === "CE" || optionType === "PE") return optionType;
  if (contract.symbol.toUpperCase().includes(" CE")) return "CE";
  return "PE";
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Apply ±0.1% random slippage to simulate paper trading realism */
function applySlippage(price: number, side: "BUY" | "SELL"): number {
  if (!Number.isFinite(price) || price <= 0) return price;
  // 0–0.1% random slippage
  const slippage = price * (Math.random() * 0.001);
  return side === "BUY" ? price + slippage : price - slippage;
}

function getRiskLevel(capitalRequired: number, balance: number): "Low" | "Medium" | "High" {
  if (balance <= 0) return "High";
  const pct = capitalRequired / balance;
  if (pct < 0.1) return "Low";
  if (pct < 0.3) return "Medium";
  return "High";
}

/** Rule-based post-trade learning message */
function getPostTradeMessage(
  side: "BUY" | "SELL",
  optionType: "CE" | "PE",
  strikeDistancePct: number | null,
  daysToExpiry: number | null
): string {
  const moneyness =
    strikeDistancePct !== null && strikeDistancePct < 0.005
      ? "ATM"
      : strikeDistancePct !== null && strikeDistancePct < 0.02
      ? "near-the-money"
      : "OTM";

  if (side === "BUY" && optionType === "CE") {
    const line1 = `You bought a ${moneyness} Call option.`;
    const line2 = "You profit if the underlying price rises above your breakeven before expiry.";
    const line3 =
      daysToExpiry !== null && daysToExpiry <= 5
        ? "⚠️ Only a few days left — theta decay will erode value quickly."
        : "Time decay works against you — the longer the trade takes, the more premium decays.";
    return `${line1}\n${line2}\n${line3}`;
  }
  if (side === "BUY" && optionType === "PE") {
    return `You bought a ${moneyness} Put option.\nYou profit if the underlying price falls below your breakeven.\nTime decay works against you — monitor your position closely.`;
  }
  if (side === "SELL" && optionType === "CE") {
    return `You sold a ${moneyness} Call option.\nYou collect premium upfront. You profit if the price stays below the strike at expiry.\n🚨 Unlimited loss risk if the price rallies sharply — watch your margin.`;
  }
  if (side === "SELL" && optionType === "PE") {
    return `You sold a ${moneyness} Put option.\nYou collect premium upfront. You profit if the price stays above the strike.\n🚨 Large loss risk if the price drops sharply — monitor margin.`;
  }
  return "Trade placed. Monitor your position and manage risk.";
}

const RISK_BADGE_STYLES: Record<string, string> = {
  Low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  High: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const KIND_STYLES: Record<OptionHint["kind"], string> = {
  info: "border-[#2d6cff]/30 bg-[#2d6cff]/8 text-[#8fb3ff]",
  warn: "border-amber-500/30 bg-amber-500/8 text-amber-300",
  tip: "border-emerald-500/30 bg-emerald-500/8 text-emerald-300",
};

export function OptionTradePanel({ contract, underlyingPrice, daysToExpiry, onClose }: OptionTradePanelProps) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [lots, setLots] = useState("1");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [limitPrice, setLimitPrice] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [postTradeMessage, setPostTradeMessage] = useState<string | null>(null);

  const executeTrade = useTradeExecutionStore((state) => state.executeTrade);
  const isOrderProcessing = useTradeExecutionStore((state) => state.isOrderProcessing);
  const orderProcessingError = useTradeExecutionStore((state) => state.orderProcessingError);
  const clearOrderProcessingError = useTradeExecutionStore((state) => state.clearOrderProcessingError);
  const positions = usePositionsStore((state) => state.positions);
  const fetchPositions = usePositionsStore((state) => state.fetchPositions);
  const balance = useWalletStore((state) => state.availableBalance);
  const fetchWallet = useWalletStore((state) => state.fetchWallet);
  const isLearningMode = useLearningModeStore((s) => s.isOn);

  const livePremium = useMarketStore((state) => {
    const token = contract.instrumentToken;
    if (!token) return 0;
    const value = Number(state.quotesByInstrument[token]?.price);
    return Number.isFinite(value) && value > 0 ? value : 0;
  });

  const optionType = getOptionType(contract);
  const strike = Number(contract.strikePrice || 0);
  const lotSize = Math.max(1, Number(contract.lotSize || 1));
  const marketPremium = livePremium || Number(contract.price || 0);
  const limitPriceValue = Number(limitPrice) || 0;
  const premium = orderType === "LIMIT" && limitPriceValue > 0 ? limitPriceValue : marketPremium;
  const lotsValue = Math.max(1, Number.parseInt(lots || "1", 10) || 1);

  const existingPosition = useMemo(() => {
    const token = contract.instrumentToken;
    if (!token) return null;
    return positions.find((p) => String(p.instrumentToken || "") === token) || null;
  }, [contract.instrumentToken, positions]);

  const existingSide = existingPosition?.side || null;
  const existingQty = Math.abs(Number(existingPosition?.quantity || 0));
  const isOppositeExitFlow = existingQty > 0 &&
    ((existingSide === "BUY" && side === "SELL") || (existingSide === "SELL" && side === "BUY"));

  const totalQuantity = isOppositeExitFlow ? existingQty : lotsValue * lotSize;
  const premiumNotional = Math.max(0, premium * totalQuantity);
  const shortMargin = Math.max(premiumNotional * 1.5, Math.max(underlyingPrice, strike, 1) * totalQuantity * 0.15);
  const capitalRequired = side === "BUY" ? premiumNotional : shortMargin;
  const breakeven = optionType === "CE" ? strike + premium : strike - premium;
  const insufficientFunds = capitalRequired > balance;
  const riskLevel = getRiskLevel(capitalRequired, balance);

  const strikeDistancePct =
    Number.isFinite(underlyingPrice) && underlyingPrice > 0
      ? Math.abs(strike - underlyingPrice) / underlyingPrice
      : null;

  const hints = useMemo(() =>
    getContextHints({
      daysToExpiry: daysToExpiry ?? null,
      strikeDistancePct,
      strategy: null,
      side,
      optionType,
      underlyingChangePct: 0,
    }),
    [daysToExpiry, strikeDistancePct, side, optionType]
  );

  const doExecute = async () => {
    if (!contract.instrumentToken) { toast.error("Instrument token missing"); return; }
    try {
      // Apply slippage only for MARKET orders to keep LIMIT fills deterministic.
      const fillPrice = orderType === "MARKET" ? applySlippage(premium, side) : premium;

      await executeTrade(
        {
          instrumentToken: contract.instrumentToken,
          symbol: contract.symbol,
          side,
          quantity: totalQuantity,
          entryPrice: fillPrice,
        },
        lotSize,
        "options",
        orderType
      );

      // Post-trade learning feedback
      const msg = getPostTradeMessage(side, optionType, strikeDistancePct, daysToExpiry ?? null);
      setPostTradeMessage(msg);

      toast.success("Order placed", { description: `${side} ${totalQuantity} ${contract.symbol}` });
      clearOrderProcessingError();
      setConfirmOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Order failed";
      const normalized = message.includes("PARTIAL_EXIT_NOT_ALLOWED")
        ? "Partial exit is disabled in paper trading mode."
        : message;
      toast.error("Order rejected", { description: normalized });
      setConfirmOpen(false);
    }
  };

  useEffect(() => {
    fetchWallet().catch(() => undefined);
    fetchPositions(true).catch(() => undefined);
  }, [fetchPositions, fetchWallet]);

  useEffect(() => {
    if (!isOppositeExitFlow) return;
    setLots(String(Math.max(1, Math.round(existingQty / lotSize))));
  }, [existingQty, isOppositeExitFlow, lotSize]);

  useEffect(() => {
    if (orderType === "LIMIT" && marketPremium > 0) setLimitPrice(String(marketPremium.toFixed(2)));
  }, [orderType, marketPremium]);

  // Reset post-trade message on contract change
  useEffect(() => { setPostTradeMessage(null); }, [contract.instrumentToken]);

  return (
    <>
      {/* Confirmation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="border-border bg-[#0f1a30]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Confirm {side} Order</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-xs">
                  <p className="mb-2 font-semibold text-slate-200">{contract.symbol}</p>
                  <div className="space-y-1.5">
                    {[
                      ["Order type", orderType],
                      ["Premium", formatMoney(premium)],
                      ["Quantity", totalQuantity.toLocaleString("en-IN")],
                      [side === "BUY" ? "Capital Required" : "Margin Blocked", formatMoney(capitalRequired)],
                      ["Max Loss", side === "BUY" ? formatMoney(premiumNotional) : "Unlimited"],
                      ["Risk Level", riskLevel],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-slate-400">{label}</span>
                        <span className={cn("font-medium", label === "Risk Level" && (riskLevel === "High" ? "text-rose-400" : riskLevel === "Medium" ? "text-amber-400" : "text-emerald-400"), label !== "Risk Level" && "text-white")}>
                          {val}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">Paper trading — order fills instantly with small slippage simulation.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/[0.1] text-slate-300 hover:bg-white/[0.05]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doExecute} disabled={isOrderProcessing}
              className={cn("font-semibold", side === "BUY" ? "bg-emerald-600 hover:bg-emerald-600/90" : "bg-rose-600 hover:bg-rose-600/90")}>
              {isOrderProcessing ? "Placing..." : `Confirm ${side}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="h-full border-border">
        <CardHeader className="border-b border-border pb-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold">{contract.symbol}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                <Badge variant="outline" className="mr-1 text-[10px]">{optionType}</Badge>
                Strike {strike ? strike.toLocaleString("en-IN") : "--"} · Lot {lotSize}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs">Hide</Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 overflow-y-auto p-3">
          {/* ── Post-trade learning feedback ── */}
          {postTradeMessage && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/8 p-3">
              <div className="mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <p className="text-xs font-semibold text-emerald-300">Trade Placed</p>
                <button
                  type="button"
                  onClick={() => setPostTradeMessage(null)}
                  className="ml-auto text-[10px] text-emerald-500/60 hover:text-emerald-400"
                >
                  dismiss
                </button>
              </div>
              <p className="whitespace-pre-line text-xs text-emerald-300/80 leading-relaxed">
                {postTradeMessage}
              </p>
            </div>
          )}

          {/* BUY / SELL toggle */}
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/20 p-1">
            {(["BUY", "SELL"] as const).map((s) => (
              <Button key={s} type="button" size="sm" onClick={() => setSide(s)}
                className={cn("h-8 text-xs", side === s
                  ? s === "BUY" ? "bg-emerald-600 text-white hover:bg-emerald-600/90" : "bg-rose-600 text-white hover:bg-rose-600/90"
                  : "bg-transparent text-muted-foreground hover:bg-background")}>
                {s}
              </Button>
            ))}
          </div>

          {/* MARKET / LIMIT toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Order</span>
            <div className="inline-flex rounded-lg border border-border bg-muted/20 p-0.5">
              {(["MARKET", "LIMIT"] as OrderType[]).map((t) => (
                <button key={t} type="button" onClick={() => setOrderType(t)}
                  className={cn("rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    orderType === t ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {orderType === "LIMIT" && (
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Limit Price (₹)</Label>
              <Input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value.replace(/[^\d.]/g, ""))}
                className="h-9" inputMode="decimal" placeholder={String(marketPremium.toFixed(2))} />
              <p className="text-[11px] text-muted-foreground">Paper trading fills instantly with simulated slippage.</p>
            </div>
          )}

          {/* Lots + Qty */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Lots</Label>
              {isOppositeExitFlow ? (
                <div className="flex h-9 items-center rounded border border-border bg-muted/30 px-2.5 text-sm font-medium">Exit Full ({totalQuantity})</div>
              ) : (
                <Input value={lots} onChange={(e) => setLots(e.target.value.replace(/[^\d]/g, ""))} className="h-9" inputMode="numeric" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Qty</Label>
              <div className="flex h-9 items-center rounded border border-border bg-background px-2.5 text-sm font-semibold tabular-nums">{totalQuantity.toLocaleString("en-IN")}</div>
            </div>
          </div>

          {/* Premium + Margin */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-border p-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Premium</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(marketPremium)}</p>
            </div>
            <div className="rounded border border-border p-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{side === "BUY" ? "Capital Req." : "Margin Blocked"}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(capitalRequired)}</p>
            </div>
          </div>

          {/* Risk summary */}
          <div className="rounded border border-border bg-background p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold">Risk Summary</p>
              <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold", RISK_BADGE_STYLES[riskLevel])}>
                {riskLevel} Risk
              </span>
            </div>
            {side === "BUY" ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Max Loss</span><span className="font-medium tabular-nums text-rose-400">{formatMoney(premiumNotional)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Max Profit</span><span className="font-medium tabular-nums text-emerald-400">Unlimited</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Breakeven</span><span className="font-medium tabular-nums">{Number.isFinite(breakeven) ? breakeven.toFixed(2) : "--"}</span></div>
              </div>
            ) : (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Max Profit</span><span className="font-medium tabular-nums text-emerald-400">{formatMoney(premiumNotional)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Max Loss</span><span className="font-medium tabular-nums text-rose-400">Unlimited</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Breakeven</span><span className="font-medium tabular-nums">{Number.isFinite(breakeven) ? breakeven.toFixed(2) : "--"}</span></div>
                <Alert className="mt-2 border-amber-500/40 bg-amber-500/8 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <AlertTitle className="text-[11px] font-semibold">Risk Warning</AlertTitle>
                  <AlertDescription className="text-[11px] text-muted-foreground">Short options can have large losses. Monitor margin closely.</AlertDescription>
                </Alert>
              </div>
            )}
          </div>

          {/* ── Trade Outcome Simulator ── */}
          <TradeOutcomeSimulator
            side={side}
            optionType={optionType}
            strike={strike}
            quantity={totalQuantity}
            premium={premium}
            spotPrice={underlyingPrice}
          />

          {/* Payoff chart */}
          <OptionPayoffChart side={side} optionType={optionType} strike={strike} quantity={totalQuantity} premium={premium} spotPrice={underlyingPrice} />

          {/* Educational hints — only in learning mode */}
          {isLearningMode && hints.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Lightbulb className="h-3 w-3 text-amber-400" /> Insights
              </p>
              {hints.map((h) => (
                <div key={h.id} className={cn("rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed", KIND_STYLES[h.kind])}>
                  {h.message}
                </div>
              ))}
            </div>
          )}

          {orderProcessingError && (
            <Alert variant="destructive">
              <AlertTitle className="text-xs">Order Error</AlertTitle>
              <AlertDescription className="text-xs">{orderProcessingError}</AlertDescription>
            </Alert>
          )}

          {insufficientFunds && (
            <Alert className="border-rose-500/40 bg-rose-500/8 py-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <AlertDescription className="text-xs text-rose-300">
                Insufficient funds. Required {formatMoney(capitalRequired)}, available {formatMoney(balance)}.
              </AlertDescription>
            </Alert>
          )}

          <Button type="button" onClick={() => setConfirmOpen(true)}
            disabled={isOrderProcessing || !contract.instrumentToken || !Number.isFinite(marketPremium) || marketPremium <= 0 || totalQuantity <= 0 || insufficientFunds}
            className={cn("h-9 w-full text-sm font-semibold", side === "BUY" ? "bg-emerald-600 hover:bg-emerald-600/90" : "bg-rose-600 hover:bg-rose-600/90")}>
            {side} {contract.symbol}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
