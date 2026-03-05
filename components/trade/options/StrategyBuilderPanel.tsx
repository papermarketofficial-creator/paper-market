"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiLegPayoffChart } from "@/components/trade/form/MultiLegPayoffChart";
import { OptionChainRow, StrategyKind } from "@/components/trade/options/types";
import { MultiLegPayoffLeg } from "@/lib/options/multi-leg-payoff";
import { getStrategyIntent, getStrategyIntentDescription } from "@/lib/options/market-context";
import { toast } from "sonner";

type StrategyBuilderPanelProps = {
  underlying: string;
  expiry: string;
  rows: OptionChainRow[];
  spotPrice: number;
  onExecutionComplete?: () => void;
};

type PreviewSummary = {
  totalPremium: number;
  premiumType: "DEBIT" | "CREDIT";
  requiredMargin: number;
  maxProfit: number | null;
  maxLoss: number | null;
  breakevens: number[];
};

type PreviewLeg = {
  role: string;
  side: "BUY" | "SELL";
  optionType: "CE" | "PE";
  strike: number;
  instrumentToken: string;
  symbol: string;
  lotSize: number;
  quantity: number;
  ltp: number;
  premium: number;
};

type StrategyPreviewResponse = {
  strategy: "STRADDLE" | "STRANGLE" | "IRON_CONDOR" | "BULL_CALL_SPREAD" | "BEAR_PUT_SPREAD";
  underlying: string;
  expiry: string;
  lots: number;
  legs: PreviewLeg[];
  summary: PreviewSummary;
};

function formatMoney(value: number | null): string {
  if (value === null) return "Unlimited";
  if (!Number.isFinite(Number(value))) return "--";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function toLegs(preview: StrategyPreviewResponse | null): MultiLegPayoffLeg[] {
  if (!preview) return [];
  return preview.legs.map((leg) => ({
    id: leg.role,
    side: leg.side,
    optionType: leg.optionType,
    strike: leg.strike,
    quantity: leg.quantity,
    premium: leg.ltp,
  }));
}

export function StrategyBuilderPanel({
  underlying,
  expiry,
  rows,
  spotPrice,
  onExecutionComplete,
}: StrategyBuilderPanelProps) {
  const [strategy, setStrategy] = useState<StrategyKind>("STRADDLE");
  const [lots, setLots] = useState("1");
  const [s1, setS1] = useState("");
  const [s2, setS2] = useState("");
  const [s3, setS3] = useState("");
  const [s4, setS4] = useState("");
  const [preview, setPreview] = useState<StrategyPreviewResponse | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const strikes = useMemo(() => rows.map((row) => row.strike).sort((a, b) => a - b), [rows]);
  const lotsValue = Math.max(1, Number.parseInt(lots || "1", 10) || 1);

  useEffect(() => {
    if (strikes.length === 0) {
      setS1("");
      setS2("");
      setS3("");
      setS4("");
      setPreview(null);
      return;
    }

    const mid = Math.floor(strikes.length / 2);
    setS1(String(strikes[Math.max(0, mid - 1)] ?? strikes[0]));
    setS2(String(strikes[mid] ?? strikes[0]));
    setS3(String(strikes[Math.min(strikes.length - 1, mid + 1)] ?? strikes[strikes.length - 1]));
    setS4(String(strikes[Math.min(strikes.length - 1, mid + 2)] ?? strikes[strikes.length - 1]));
  }, [strikes]);

  const payload = useMemo(() => {
    if (!underlying || !expiry || strikes.length === 0) return null;
    const p1 = Number(s1);
    const p2 = Number(s2);
    const p3 = Number(s3);
    const p4 = Number(s4);

    if (strategy === "STRADDLE") {
      if (!Number.isFinite(p2)) return null;
      return {
        strategy: "STRADDLE" as const,
        underlying,
        expiry,
        lots: lotsValue,
        strikes: {
          centerStrike: p2,
        },
      };
    }

    if (strategy === "STRANGLE") {
      if (!Number.isFinite(p1) || !Number.isFinite(p3) || p1 >= p3) return null;
      return {
        strategy: "STRANGLE" as const,
        underlying,
        expiry,
        lots: lotsValue,
        strikes: {
          putStrike: p1,
          callStrike: p3,
        },
      };
    }

    if (strategy === "VERTICAL_SPREAD") {
      if (!Number.isFinite(p2) || !Number.isFinite(p3) || p2 >= p3) return null;
      return {
        strategy: "BULL_CALL_SPREAD" as const,
        underlying,
        expiry,
        lots: lotsValue,
        strikes: {
          longCallStrike: p2,
          shortCallStrike: p3,
        },
      };
    }

    if (!Number.isFinite(p1) || !Number.isFinite(p2) || !Number.isFinite(p3) || !Number.isFinite(p4)) return null;
    if (!(p1 < p2 && p2 < p3 && p3 < p4)) return null;

    return {
      strategy: "IRON_CONDOR" as const,
      underlying,
      expiry,
      lots: lotsValue,
      strikes: {
        putLongStrike: p1,
        putShortStrike: p2,
        callShortStrike: p3,
        callLongStrike: p4,
      },
    };
  }, [underlying, expiry, strikes.length, strategy, lotsValue, s1, s2, s3, s4]);

  useEffect(() => {
    if (!payload) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsPreviewing(true);
      setPreviewError(null);
      try {
        const res = await fetch("/api/v1/options/strategies/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const response = await res.json();
        if (!res.ok || !response?.success) {
          throw new Error(response?.error?.message || "Preview unavailable");
        }
        if (!cancelled) {
          setPreview(response.data as StrategyPreviewResponse);
        }
      } catch (error) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(error instanceof Error ? error.message : "Preview unavailable");
        }
      } finally {
        if (!cancelled) {
          setIsPreviewing(false);
        }
      }
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [payload]);

  const executeStrategy = async () => {
    if (!payload || isExecuting) return;
    setIsExecuting(true);
    try {
      const res = await fetch("/api/v1/options/strategies/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          clientOrderKey: `STRAT-${Date.now()}`,
        }),
      });
      const response = await res.json();
      if (!res.ok || !response?.success) {
        throw new Error(response?.error?.message || "Execution failed");
      }
      toast.success("Strategy executed");
      onExecutionComplete?.();
    } catch (error) {
      toast.error("Strategy execution failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const payoffLegs = useMemo(() => toLegs(preview), [preview]);

  return (
    <Card className="h-full border-border">
      <CardHeader className="border-b border-border pb-2.5">
        <CardTitle className="text-sm font-semibold">Strategy Builder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Strategy</Label>
            <Select value={strategy} onValueChange={(value) => setStrategy(value as StrategyKind)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STRADDLE">Straddle</SelectItem>
                <SelectItem value="STRANGLE">Strangle</SelectItem>
                <SelectItem value="VERTICAL_SPREAD">Vertical Spread</SelectItem>
                <SelectItem value="IRON_CONDOR">Iron Condor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Lots</Label>
            <Input
              value={lots}
              onChange={(event) => setLots(event.target.value.replace(/[^\d]/g, ""))}
              className="h-9"
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(strategy === "STRANGLE" || strategy === "IRON_CONDOR") && (
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Strike 1</Label>
              <Select value={s1} onValueChange={setS1}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{strikes.map((x) => <SelectItem key={`s1-${x}`} value={String(x)}>{x}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {strategy === "STRADDLE" ? "Center Strike" : "Strike 2"}
            </Label>
            <Select value={s2} onValueChange={setS2}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{strikes.map((x) => <SelectItem key={`s2-${x}`} value={String(x)}>{x}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {(strategy === "STRANGLE" || strategy === "VERTICAL_SPREAD" || strategy === "IRON_CONDOR") && (
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Strike 3</Label>
              <Select value={s3} onValueChange={setS3}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{strikes.map((x) => <SelectItem key={`s3-${x}`} value={String(x)}>{x}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {strategy === "IRON_CONDOR" && (
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Strike 4</Label>
              <Select value={s4} onValueChange={setS4}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{strikes.map((x) => <SelectItem key={`s4-${x}`} value={String(x)}>{x}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="rounded border border-border bg-background p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold">Strategy Summary</p>
            {isPreviewing ? <Badge variant="outline">Previewing...</Badge> : null}
          </div>
          {preview ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div className="text-muted-foreground">Net Premium</div>
              <div className="text-right font-medium tabular-nums">
                {formatMoney(Math.abs(preview.summary.totalPremium))} ({preview.summary.premiumType})
              </div>
              <div className="text-muted-foreground">Max Profit</div>
              <div className="text-right font-medium tabular-nums">{formatMoney(preview.summary.maxProfit)}</div>
              <div className="text-muted-foreground">Max Loss</div>
              <div className="text-right font-medium tabular-nums">{formatMoney(preview.summary.maxLoss)}</div>
              <div className="text-muted-foreground">Breakeven</div>
              <div className="text-right font-medium tabular-nums">
                {preview.summary.breakevens.length > 0
                  ? preview.summary.breakevens.map((x) => x.toFixed(2)).join(" / ")
                  : "--"}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {previewError || "Select valid strikes to generate strategy preview."}
            </p>
          )}
        </div>

        <MultiLegPayoffChart legs={payoffLegs} spotPrice={spotPrice} title="Strategy Payoff" height={220} />

        {/* Strategy Intent Label */}
        {(() => {
          const intent = getStrategyIntent(strategy);
          const desc = getStrategyIntentDescription(intent);
          const intentColors: Record<string, string> = {
            Neutral: "bg-[#2d6cff]/15 text-[#8fb3ff] border-[#2d6cff]/30",
            Bullish: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
            Bearish: "bg-rose-500/15 text-rose-400 border-rose-500/30",
            Income: "bg-amber-500/15 text-amber-400 border-amber-500/30",
            Hedged: "bg-purple-500/15 text-purple-400 border-purple-500/30",
          };
          return (
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-slate-400">Strategy Intent:</span>
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${intentColors[intent] || ""}`}>
                  {intent}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">{desc}</p>
            </div>
          );
        })()}

        <Button
          type="button"
          className="h-9 w-full text-sm font-semibold"
          onClick={executeStrategy}
          disabled={!preview || isExecuting}
        >
          {isExecuting ? "Executing..." : "Execute Strategy"}
        </Button>
      </CardContent>
    </Card>
  );
}
