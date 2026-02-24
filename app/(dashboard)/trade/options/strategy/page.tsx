"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMarketStore } from "@/stores/trading/market.store";
import type { OptionChainRow, StrategyKind } from "@/components/trade/options/types";
import type { Stock } from "@/types/equity.types";
import type { MultiLegPayoffLeg } from "@/lib/options/multi-leg-payoff";
import { findBreakevenPrices, generateMultiLegPayoffSeries } from "@/lib/options/multi-leg-payoff";
import { cn } from "@/lib/utils";

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

function toDateKey(raw: Date | string | undefined): string {
  if (!raw) return "";
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function buildOptionChainKey(symbol: string, expiry?: string): string {
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();
  const expiryKey = toDateKey(expiry);
  return `${normalizedSymbol}::${expiryKey || "NEAREST"}`;
}

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

function formatAxis(value: number): string {
  if (Math.abs(value) >= 100000) return `${Math.round(value / 1000)}k`;
  return `${Math.round(value)}`;
}

function formatCurrencyTick(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function mapRows(strikes: any[] = []): OptionChainRow[] {
  return strikes
    .map((item: any) => ({
      strike: Number(item.strike || 0),
      ce: item.ce
        ? {
            symbol: String(item.ce.symbol || ""),
            ltp: Number(item.ce.ltp || 0),
            oi: Number(item.ce.oi || 0),
            volume: Number(item.ce.volume || 0),
          }
        : undefined,
      pe: item.pe
        ? {
            symbol: String(item.pe.symbol || ""),
            ltp: Number(item.pe.ltp || 0),
            oi: Number(item.pe.oi || 0),
            volume: Number(item.pe.volume || 0),
          }
        : undefined,
    }))
    .filter((row) => Number.isFinite(row.strike) && row.strike > 0)
    .sort((a, b) => a.strike - b.strike);
}

function OptionsStrategyBuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialSymbol = String(searchParams.get("symbol") || "NIFTY").trim().toUpperCase();
  const initialExpiry = String(searchParams.get("expiry") || "").trim();

  const [underlying, setUnderlying] = useState(initialSymbol || "NIFTY");
  const [selectedExpiry, setSelectedExpiry] = useState(initialExpiry);
  const [contracts, setContracts] = useState<Stock[]>([]);
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

  const optionChainKey = useMemo(
    () => buildOptionChainKey(underlying, selectedExpiry || undefined),
    [selectedExpiry, underlying]
  );

  const fetchOptionChain = useMarketStore((state) => state.fetchOptionChain);
  const optionChain = useMarketStore((state) => state.optionChainByKey[optionChainKey] || null);
  const selectPrice = useMarketStore((state) => state.selectPrice);
  const isFetchingChain = useMarketStore(
    (state) => state.isFetchingChain && state.fetchingOptionChainKey === optionChainKey
  );

  useEffect(() => {
    if (!underlying) return;
    let cancelled = false;

    const loadContracts = async () => {
      const params = new URLSearchParams({
        underlying,
        instrumentType: "OPTION",
      });
      const res = await fetch(`/api/v1/instruments/derivatives?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await res.json();
      if (cancelled) return;
      setContracts(payload?.data?.instruments || []);
    };

    loadContracts().catch(() => {
      if (!cancelled) setContracts([]);
    });

    return () => {
      cancelled = true;
    };
  }, [underlying]);

  const expiries = useMemo(() => {
    const keys = new Set<string>();
    for (const item of contracts) {
      const key = toDateKey(item.expiryDate);
      if (key) keys.add(key);
    }
    return Array.from(keys).sort();
  }, [contracts]);

  useEffect(() => {
    if (expiries.length === 0) {
      setSelectedExpiry("");
      return;
    }
    if (!selectedExpiry || !expiries.includes(selectedExpiry)) {
      setSelectedExpiry(expiries[0]);
    }
  }, [expiries, selectedExpiry]);

  useEffect(() => {
    if (!underlying) return;
    if (optionChain) return;
    const timer = window.setTimeout(() => {
      fetchOptionChain(underlying, selectedExpiry || undefined).catch(() => undefined);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [fetchOptionChain, optionChain, selectedExpiry, underlying]);

  const rows = useMemo(() => mapRows(optionChain?.strikes || []), [optionChain?.strikes]);
  const strikes = useMemo(() => rows.map((row) => row.strike).sort((a, b) => a - b), [rows]);
  const lotsValue = Math.max(1, Number.parseInt(lots || "1", 10) || 1);
  const spotPrice = Number(optionChain?.underlyingPrice || selectPrice(underlying) || 0);

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
    if (!underlying || !selectedExpiry || strikes.length === 0) return null;
    const p1 = Number(s1);
    const p2 = Number(s2);
    const p3 = Number(s3);
    const p4 = Number(s4);

    if (strategy === "STRADDLE") {
      if (!Number.isFinite(p2)) return null;
      return {
        strategy: "STRADDLE" as const,
        underlying,
        expiry: selectedExpiry,
        lots: lotsValue,
        strikes: { centerStrike: p2 },
      };
    }

    if (strategy === "STRANGLE") {
      if (!Number.isFinite(p1) || !Number.isFinite(p3) || p1 >= p3) return null;
      return {
        strategy: "STRANGLE" as const,
        underlying,
        expiry: selectedExpiry,
        lots: lotsValue,
        strikes: { putStrike: p1, callStrike: p3 },
      };
    }

    if (strategy === "VERTICAL_SPREAD") {
      if (!Number.isFinite(p2) || !Number.isFinite(p3) || p2 >= p3) return null;
      return {
        strategy: "BULL_CALL_SPREAD" as const,
        underlying,
        expiry: selectedExpiry,
        lots: lotsValue,
        strikes: { longCallStrike: p2, shortCallStrike: p3 },
      };
    }

    if (!Number.isFinite(p1) || !Number.isFinite(p2) || !Number.isFinite(p3) || !Number.isFinite(p4)) return null;
    if (!(p1 < p2 && p2 < p3 && p3 < p4)) return null;

    return {
      strategy: "IRON_CONDOR" as const,
      underlying,
      expiry: selectedExpiry,
      lots: lotsValue,
      strikes: {
        putLongStrike: p1,
        putShortStrike: p2,
        callShortStrike: p3,
        callLongStrike: p4,
      },
    };
  }, [lotsValue, s1, s2, s3, s4, selectedExpiry, strategy, strikes.length, underlying]);

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
        if (!cancelled) setPreview(response.data as StrategyPreviewResponse);
      } catch (error) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(error instanceof Error ? error.message : "Preview unavailable");
        }
      } finally {
        if (!cancelled) setIsPreviewing(false);
      }
    }, 220);

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
    } catch (error) {
      toast.error("Strategy execution failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const payoffLegs = useMemo(() => toLegs(preview), [preview]);
  const payoffData = useMemo(() => generateMultiLegPayoffSeries(payoffLegs, 160), [payoffLegs]);
  const breakevens = useMemo(
    () => (preview?.summary?.breakevens?.length ? preview.summary.breakevens : findBreakevenPrices(payoffData)),
    [payoffData, preview?.summary?.breakevens]
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-y-auto bg-[#090d18] px-2 py-2">
      <div className="flex min-h-full flex-col gap-2">
        <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,.76),rgba(10,14,24,.92))] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/trade/options")}
              className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-slate-100 hover:bg-white/[0.1]"
            >
              Back
            </button>
            <h1 className="text-lg font-semibold text-white">Build Strategy</h1>
            <span className="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-medium text-slate-200">
              {underlying}
            </span>
            <span className="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-medium text-slate-200">
              Spot: {Number.isFinite(spotPrice) && spotPrice > 0 ? spotPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "--"}
            </span>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[460px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,37,.85),rgba(11,15,24,.92))] p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Builder</p>
              {isPreviewing ? <span className="text-xs text-slate-400">Updating...</span> : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Underlying</span>
                <input
                  value={underlying}
                  onChange={(e) => setUnderlying(e.target.value.toUpperCase())}
                  className="h-9 w-full rounded-lg border border-white/10 bg-[#0f1628] px-2.5 text-sm text-white outline-none focus:border-[#2d6cff]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Expiry</span>
                <select
                  value={selectedExpiry}
                  onChange={(e) => setSelectedExpiry(e.target.value)}
                  className="h-9 w-full rounded-lg border border-white/10 bg-[#0f1628] px-2.5 text-sm text-white outline-none focus:border-[#2d6cff]"
                >
                  {expiries.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Strategy</span>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as StrategyKind)}
                  className="h-9 w-full rounded-lg border border-white/10 bg-[#0f1628] px-2.5 text-sm text-white outline-none focus:border-[#2d6cff]"
                >
                  <option value="STRADDLE">Straddle</option>
                  <option value="STRANGLE">Strangle</option>
                  <option value="VERTICAL_SPREAD">Vertical Spread</option>
                  <option value="IRON_CONDOR">Iron Condor</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Lots</span>
                <input
                  value={lots}
                  onChange={(e) => setLots(e.target.value.replace(/[^\d]/g, ""))}
                  className="h-9 w-full rounded-lg border border-white/10 bg-[#0f1628] px-2.5 text-sm text-white outline-none focus:border-[#2d6cff]"
                />
              </label>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {(strategy === "STRANGLE" || strategy === "IRON_CONDOR") && (
                <select value={s1} onChange={(e) => setS1(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#0f1628] px-2.5 text-sm text-white">
                  {strikes.map((x) => (
                    <option key={`s1-${x}`} value={String(x)}>
                      Strike 1: {x}
                    </option>
                  ))}
                </select>
              )}
              <select value={s2} onChange={(e) => setS2(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#0f1628] px-2.5 text-sm text-white">
                {strikes.map((x) => (
                  <option key={`s2-${x}`} value={String(x)}>
                    Strike 2: {x}
                  </option>
                ))}
              </select>
              {(strategy === "STRANGLE" || strategy === "VERTICAL_SPREAD" || strategy === "IRON_CONDOR") && (
                <select value={s3} onChange={(e) => setS3(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#0f1628] px-2.5 text-sm text-white">
                  {strikes.map((x) => (
                    <option key={`s3-${x}`} value={String(x)}>
                      Strike 3: {x}
                    </option>
                  ))}
                </select>
              )}
              {strategy === "IRON_CONDOR" && (
                <select value={s4} onChange={(e) => setS4(e.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#0f1628] px-2.5 text-sm text-white">
                  {strikes.map((x) => (
                    <option key={`s4-${x}`} value={String(x)}>
                      Strike 4: {x}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-[#0d1424]">
              <div className="grid grid-cols-[70px_1fr_1fr] border-b border-white/10 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <span>Side</span>
                <span>Contract</span>
                <span className="text-right">Price</span>
              </div>
              {preview?.legs?.length ? (
                preview.legs.map((leg) => (
                  <div key={leg.role} className="grid grid-cols-[70px_1fr_1fr] px-2 py-2 text-sm text-slate-200">
                    <span className={cn("w-fit rounded px-2 py-0.5 text-xs font-semibold", leg.side === "BUY" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>
                      {leg.side}
                    </span>
                    <span className="truncate pr-2">{leg.symbol}</span>
                    <span className="text-right tabular-nums">{leg.ltp.toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <div className="px-2 py-4 text-center text-xs text-slate-400">
                  {isFetchingChain ? "Loading contracts..." : previewError || "Set strategy inputs to preview legs"}
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-[#0f1628] px-2.5 py-2 text-slate-300">
                Net premium
                <div className="mt-1 text-base font-semibold text-white">
                  {formatMoney(Math.abs(Number(preview?.summary?.totalPremium || 0)))}
                </div>
              </div>
              <div className="rounded-lg bg-[#0f1628] px-2.5 py-2 text-slate-300">
                Est. Margin
                <div className="mt-1 text-base font-semibold text-white">{formatMoney(preview?.summary?.requiredMargin || 0)}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={executeStrategy}
              disabled={!preview || isExecuting}
              className={cn(
                "mt-4 h-10 w-full rounded-lg text-sm font-semibold transition-colors",
                !preview || isExecuting
                  ? "cursor-not-allowed bg-slate-700 text-slate-300"
                  : "bg-[#7c4dff] text-white hover:bg-[#8b5dff]"
              )}
            >
              {isExecuting ? "Executing..." : "Review Strategy"}
            </button>
          </section>

          <section className="min-h-0 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,37,.85),rgba(11,15,24,.92))] p-3">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
              <div className="rounded-xl bg-[#0f1628] px-3 py-2">
                <p className="text-[11px] text-slate-400">Max Profit</p>
                <p className="mt-1 text-lg font-semibold text-emerald-300">{formatMoney(preview?.summary?.maxProfit ?? null)}</p>
              </div>
              <div className="rounded-xl bg-[#0f1628] px-3 py-2">
                <p className="text-[11px] text-slate-400">Max Loss</p>
                <p className="mt-1 text-lg font-semibold text-rose-300">{formatMoney(preview?.summary?.maxLoss ?? null)}</p>
              </div>
              <div className="rounded-xl bg-[#0f1628] px-3 py-2">
                <p className="text-[11px] text-slate-400">Breakevens</p>
                <p className="mt-1 text-sm font-semibold text-white">{breakevens.length ? breakevens.map((x) => x.toFixed(2)).join(" / ") : "--"}</p>
              </div>
              <div className="rounded-xl bg-[#0f1628] px-3 py-2">
                <p className="text-[11px] text-slate-400">Risk/Reward</p>
                <p className="mt-1 text-sm font-semibold text-white">--</p>
              </div>
              <div className="rounded-xl bg-[#0f1628] px-3 py-2">
                <p className="text-[11px] text-slate-400">Net Debit</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatMoney(Math.abs(Number(preview?.summary?.totalPremium || 0)))}</p>
              </div>
            </div>

            <div className="mt-3 h-[420px] rounded-xl border border-white/10 bg-[#0c1322] p-2">
              {payoffLegs.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-slate-400">
                  {isPreviewing ? "Calculating payoff..." : "Add valid legs to view payoff graph"}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={payoffData} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.2)" />
                    <XAxis
                      dataKey="price"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={formatAxis}
                      tick={{ fontSize: 11, fill: "#93a4bf" }}
                    />
                    <YAxis tickFormatter={formatAxis} tick={{ fontSize: 11, fill: "#93a4bf" }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "rgba(148,163,184,.3)", fontSize: "12px" }}
                      formatter={(value: number) => [formatCurrencyTick(value), "P&L"]}
                      labelFormatter={(label) => `Spot ${Number(label).toFixed(2)}`}
                    />
                    <ReferenceLine y={0} stroke="rgba(148,163,184,.6)" strokeDasharray="4 4" />
                    {Number.isFinite(spotPrice) && spotPrice > 0 ? (
                      <ReferenceLine x={spotPrice} stroke="#22d3ee" strokeDasharray="3 3" />
                    ) : null}
                    <Line type="monotone" dataKey="pnl" stroke="#8b5cf6" strokeWidth={2.2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function OptionsStrategyBuilderPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-slate-400 text-sm">Loading strategy builder…</div>}>
      <OptionsStrategyBuilderContent />
    </Suspense>
  );
}
