"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { GlobalSearchModal } from "@/components/trade/search/GlobalSearchModal";
import { TerminalHeader } from "@/components/trade/options/TerminalHeader";
import { OptionChainTable } from "@/components/trade/options/OptionChainTable";
import { OrderPanel } from "@/components/trade/options/OrderPanel";
import { EmptyPanel } from "@/components/trade/options/EmptyPanel";
import { StrategyBuilderPanel } from "@/components/trade/options/StrategyBuilderPanel";
import { BottomBar } from "@/components/trade/options/BottomBar";
import { OptionChainRow } from "@/components/trade/options/types";
import { Stock } from "@/types/equity.types";
import { useMarketStore } from "@/stores/trading/market.store";
import { symbolToIndexInstrumentKey } from "@/lib/market/symbol-normalization";
import { AdaptiveTradeLayout } from "@/components/trade/layout/AdaptiveTradeLayout";
import { PositionsCards } from "@/components/trade/mobile/PositionsCards";
import { useWalletStore } from "@/stores/wallet.store";
import { useTradeViewport } from "@/hooks/use-trade-viewport";
import { cn } from "@/lib/utils";

type TradeMode = "single" | "strategy";
type MobileView = "chain" | "chart" | "positions" | "strategy";

const CandlestickChartComponent = dynamic(
  () =>
    import("@/components/trade/CandlestickChart").then((mod) => ({
      default: mod.CandlestickChart,
    })),
  { ssr: false },
);

function normalizeKey(v: string): string {
  return String(v || "").trim().toUpperCase().replace(/\s+/g, "");
}

function toDateKey(raw: Date | string | undefined): string {
  if (!raw) return "";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function buildOptionChainKey(symbol: string, expiry?: string): string {
  const s = String(symbol || "").trim().toUpperCase();
  const e = toDateKey(expiry);
  return `${s}::${e || "NEAREST"}`;
}

function resolveUnderlying(stock: Stock): string {
  const key = normalizeKey(String(stock.name || stock.symbol || ""));
  if (key === "NIFTY" || key === "NIFTY50" || key === "NIFTY_50") return "NIFTY";
  if (key === "BANKNIFTY" || key === "NIFTYBANK") return "BANKNIFTY";
  if (key === "FINNIFTY" || key === "NIFTYFINSERVICE") return "FINNIFTY";
  if (key === "SENSEX") return "SENSEX";
  if (key === "MIDCAP" || key === "MIDCPNIFTY") return "MIDCAP";
  return key;
}

function getDaysToExpiry(dateKey: string): number | null {
  if (!dateKey) return null;
  const now = new Date();
  const exp = new Date(`${dateKey}T15:30:00+05:30`);
  if (Number.isNaN(exp.getTime())) return null;
  return Math.ceil((exp.getTime() - now.getTime()) / 86_400_000);
}

function formatBalance(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `INR ${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatExpiryChip(dateKey: string): string {
  if (!dateKey) return "--";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function formatLtp(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "--";
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export default function OptionsPage() {
  const { isMobile } = useTradeViewport();
  const walletBalance = useWalletStore((state) => state.balance);

  const [searchOpen, setSearchOpen] = useState(false);
  const [underlying, setUnderlying] = useState("NIFTY");
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [contracts, setContracts] = useState<Stock[]>([]);
  const [selectedContract, setSelectedContract] = useState<Stock | null>(null);
  const [initialSide, setInitialSide] = useState<"BUY" | "SELL">("BUY");
  const [mode, setMode] = useState<TradeMode>("single");
  const [mobileOrderOpen, setMobileOrderOpen] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("chain");

  const fetchOptionChain = useMarketStore((s) => s.fetchOptionChain);
  const chainKey = useMemo(
    () => buildOptionChainKey(underlying, selectedExpiry || undefined),
    [selectedExpiry, underlying],
  );
  const optionChain = useMarketStore((s) => s.optionChainByKey[chainKey] || null);
  const isFetching = useMarketStore(
    (s) => s.isFetchingChain && s.fetchingOptionChainKey === chainKey,
  );
  const selectPrice = useMarketStore((s) => s.selectPrice);
  const selectQuote = useMarketStore((s) => s.selectQuote);

  useEffect(() => {
    if (!underlying) {
      setContracts([]);
      setSelectedContract(null);
      setSelectedExpiry("");
      return;
    }
    let cancelled = false;
    const load = async () => {
      const params = new URLSearchParams({ underlying, instrumentType: "OPTION" });
      const res = await fetch(`/api/v1/instruments/derivatives?${params}`, { cache: "no-store" });
      const payload = await res.json();
      const items: Stock[] = payload?.data?.instruments || [];
      if (!cancelled) setContracts(items);
    };
    load().catch(() => {
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
    if (!selectedExpiry || !expiries.includes(selectedExpiry)) setSelectedExpiry(expiries[0]);
  }, [expiries, selectedExpiry]);

  const filteredContracts = useMemo(
    () =>
      selectedExpiry
        ? contracts.filter((c) => toDateKey(c.expiryDate) === selectedExpiry)
        : [],
    [contracts, selectedExpiry],
  );

  const optionTokenBySymbol = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const c of filteredContracts) {
      const sym = String(c.symbol || "").trim();
      const tok = String(c.instrumentToken || "").trim();
      if (sym && tok) map[sym] = tok;
    }
    return map;
  }, [filteredContracts]);

  useEffect(() => {
    if (!selectedContract) return;
    const exists = filteredContracts.some(
      (c) => c.instrumentToken === selectedContract.instrumentToken,
    );
    if (!exists) setSelectedContract(null);
  }, [filteredContracts, selectedContract]);

  useEffect(() => {
    if (!underlying) return;
    if (optionChain) return;
    const timer = window.setTimeout(() => {
      fetchOptionChain(underlying, selectedExpiry || undefined).catch(() => undefined);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [fetchOptionChain, optionChain, selectedExpiry, underlying]);

  const chainRows = useMemo<OptionChainRow[]>(() => {
    const strikes = optionChain?.strikes || [];
    return (strikes as Array<Record<string, unknown>>)
      .map((item) => ({
        strike: Number(item.strike || 0),
        ce: item.ce
          ? {
              symbol: String((item.ce as Record<string, unknown>).symbol || ""),
              ltp: Number((item.ce as Record<string, unknown>).ltp || 0),
              oi: Number((item.ce as Record<string, unknown>).oi || 0),
              volume: Number((item.ce as Record<string, unknown>).volume || 0),
            }
          : undefined,
        pe: item.pe
          ? {
              symbol: String((item.pe as Record<string, unknown>).symbol || ""),
              ltp: Number((item.pe as Record<string, unknown>).ltp || 0),
              oi: Number((item.pe as Record<string, unknown>).oi || 0),
              volume: Number((item.pe as Record<string, unknown>).volume || 0),
            }
          : undefined,
      }))
      .filter((r) => Number.isFinite(r.strike) && r.strike > 0)
      .sort((a, b) => a.strike - b.strike);
  }, [optionChain?.strikes]);

  const underlyingQuote = selectQuote(underlying);
  const chainPrice = Number(optionChain?.underlyingPrice || 0);
  const fallbackPrice = Number(selectPrice(underlying) || 0);
  const underlyingPrice =
    (Number.isFinite(chainPrice) && chainPrice > 0 ? chainPrice : fallbackPrice) || 0;

  const chainChange = Number(optionChain?.underlyingChangePercent || 0);
  const quoteChange = Number(underlyingQuote?.changePercent || 0);
  const changePercent =
    Number.isFinite(chainChange) && chainChange !== 0 ? chainChange : quoteChange;

  const atmStrike = useMemo(() => {
    if (!chainRows.length || !Number.isFinite(underlyingPrice) || underlyingPrice <= 0) return null;
    let best = chainRows[0].strike;
    let minD = Math.abs(best - underlyingPrice);
    for (const r of chainRows) {
      const d = Math.abs(r.strike - underlyingPrice);
      if (d < minD) {
        minD = d;
        best = r.strike;
      }
    }
    return best;
  }, [chainRows, underlyingPrice]);

  const daysToExpiry = getDaysToExpiry(selectedExpiry);

  const handleSearchSelect = (stock: Stock) => {
    setUnderlying(resolveUnderlying(stock));
    const exp = toDateKey(stock.expiryDate);
    if (exp) setSelectedExpiry(exp);
    setSelectedContract(stock);
    setSearchOpen(false);
    setMode("single");
    if (isMobile) setMobileView("chain");
  };

  const handleSelectChainSymbol = (symbol: string, side: "BUY" | "SELL" = "BUY") => {
    const found =
      filteredContracts.find((c) => c.symbol === symbol) ||
      contracts.find((c) => c.symbol === symbol);
    if (!found) return;

    let chainLtp = 0;
    for (const row of chainRows) {
      if (row.ce?.symbol === symbol && row.ce.ltp > 0) {
        chainLtp = row.ce.ltp;
        break;
      }
      if (row.pe?.symbol === symbol && row.pe.ltp > 0) {
        chainLtp = row.pe.ltp;
        break;
      }
    }

    const contractWithPrice = chainLtp > 0 ? { ...found, price: chainLtp } : found;
    setSelectedContract(contractWithPrice);
    setInitialSide(side);
    setMode("single");
    if (isMobile) setMobileOrderOpen(true);
  };

  const handleModeChange = (nextMode: TradeMode) => {
    setMode(nextMode);
    if (nextMode === "strategy") {
      setSelectedContract(null);
      if (isMobile) setMobileView("strategy");
      return;
    }
    if (isMobile && mobileView === "strategy") setMobileView("chain");
  };

  const renderPanel = (sheetMode = false) => {
    if (mode === "strategy") {
      return (
        <div className="h-full overflow-y-auto">
          <StrategyBuilderPanel
            underlying={underlying}
            expiry={selectedExpiry}
            rows={chainRows}
            spotPrice={underlyingPrice}
            onExecutionComplete={() => undefined}
          />
        </div>
      );
    }

    if (selectedContract) {
      return (
        <OrderPanel
          contract={selectedContract}
          underlyingPrice={underlyingPrice}
          daysToExpiry={daysToExpiry}
          initialSide={initialSide}
          onClose={() => setSelectedContract(null)}
          sheetMode={sheetMode}
        />
      );
    }

    return (
      <EmptyPanel
        underlyingSymbol={underlying}
        atmStrike={atmStrike}
        daysToExpiry={daysToExpiry}
        onSearchClick={() => setSearchOpen(true)}
      />
    );
  };

  const hasPanelContent = mode === "strategy" || !!selectedContract;

  const headerNode = (
    <TerminalHeader
      underlyingLabel={underlying}
      underlyingPrice={underlyingPrice}
      underlyingChangePercent={changePercent}
      selectedExpiry={selectedExpiry}
      expiries={expiries}
      daysToExpiry={daysToExpiry}
      atmStrike={atmStrike}
      mode={mode}
      onOpenSearch={() => setSearchOpen(true)}
      onModeChange={handleModeChange}
      onExpiryChange={setSelectedExpiry}
    />
  );

  const chainNode = (
    <OptionChainTable
      rows={chainRows}
      underlyingPrice={underlyingPrice}
      atmStrike={atmStrike}
      expiryKey={optionChain?.expiry || selectedExpiry || ""}
      chainKey={chainKey}
      optionTokenBySymbol={optionTokenBySymbol}
      selectedSymbol={selectedContract?.symbol || null}
      onSelectSymbol={handleSelectChainSymbol}
      isLoading={isFetching}
    />
  );

  const chartNode = (
    <div className="h-full min-h-0 overflow-hidden bg-card">
      <CandlestickChartComponent
        symbol={underlying}
        headerSymbol={underlying}
        instrumentKey={symbolToIndexInstrumentKey(underlying) || undefined}
        onSearchClick={() => setSearchOpen(true)}
      />
    </div>
  );

  const mobileChainNode = (
    <OptionChainTable
      rows={chainRows}
      underlyingPrice={underlyingPrice}
      atmStrike={atmStrike}
      expiryKey={optionChain?.expiry || selectedExpiry || ""}
      chainKey={chainKey}
      optionTokenBySymbol={optionTokenBySymbol}
      selectedSymbol={selectedContract?.symbol || null}
      onSelectSymbol={handleSelectChainSymbol}
      isLoading={isFetching}
      mobileMode
    />
  );

  const mobileViewNode =
    mobileView === "chart"
      ? chartNode
      : mobileView === "positions"
      ? <PositionsCards instrumentFilter="options" />
      : mobileView === "strategy"
      ? <div className="h-full min-h-0 overflow-y-auto">{renderPanel(true)}</div>
      : mobileChainNode;

  const mobileContentNode = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="space-y-2 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground"
            >
              {underlying || "OPTIONS"}
            </button>
            <p className="truncate text-[11px] text-muted-foreground">
              Balance: <span className="font-semibold text-foreground">{formatBalance(walletBalance)}</span>
            </p>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[34px] leading-none font-bold tabular-nums text-foreground">{formatLtp(underlyingPrice)}</p>
              <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                <span className={cn("font-semibold", changePercent >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>
                  {formatPct(changePercent)}
                </span>
                {atmStrike ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    ATM {atmStrike.toLocaleString("en-IN")}
                  </span>
                ) : null}
                {daysToExpiry !== null ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    {Math.max(0, daysToExpiry)}D
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-1.5 pb-1">
              <button
                type="button"
                onClick={() => {
                  setMode("single");
                  setInitialSide("BUY");
                  setMobileOrderOpen(true);
                }}
                className="h-9 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm"
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("single");
                  setInitialSide("SELL");
                  setMobileOrderOpen(true);
                }}
                className="h-9 rounded-md bg-rose-600 px-3 text-xs font-bold text-white shadow-sm"
              >
                SELL
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {expiries.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">Loading expiries...</span>
            ) : (
              expiries.slice(0, 8).map((exp) => {
                const active = exp === selectedExpiry;
                return (
                  <button
                    key={exp}
                    type="button"
                    onClick={() => setSelectedExpiry(exp)}
                    className={cn(
                      "shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      active
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {formatExpiryChip(exp)}
                  </button>
                );
              })
            )}
          </div>

          <div className="relative grid h-9 grid-cols-2 rounded-full bg-muted/45 p-1">
            <span
              className={cn(
                "absolute inset-y-1 w-[calc(50%-4px)] rounded-full border transition-transform duration-200",
                mode === "single"
                  ? "translate-x-0 border-emerald-500/30 bg-emerald-500/15"
                  : "translate-x-[calc(100%+4px)] border-rose-500/30 bg-rose-500/12",
              )}
            />
            <button
              type="button"
              onClick={() => {
                handleModeChange("single");
                if (mobileView === "strategy") setMobileView("chain");
              }}
              className={cn(
                "relative z-10 h-7 rounded-full text-xs font-semibold transition-colors",
                mode === "single"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "text-muted-foreground",
              )}
            >
              Single
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("strategy")}
              className={cn(
                "relative z-10 h-7 rounded-full text-xs font-semibold transition-colors",
                mode === "strategy"
                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                  : "text-muted-foreground",
              )}
            >
              Strategy
            </button>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto rounded-full bg-muted/40 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => {
                handleModeChange("single");
                setMobileView("chain");
              }}
              className={cn(
                "h-8 min-w-[74px] rounded-full px-3 text-[11px] font-semibold transition-colors",
                mobileView === "chain"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              Chain
            </button>
            <button
              type="button"
              onClick={() => {
                handleModeChange("single");
                setMobileView("chart");
              }}
              className={cn(
                "h-8 min-w-[74px] rounded-full px-3 text-[11px] font-semibold transition-colors",
                mobileView === "chart"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              Chart
            </button>
            <button
              type="button"
              onClick={() => {
                handleModeChange("single");
                setMobileView("positions");
              }}
              className={cn(
                "h-8 min-w-[82px] rounded-full px-3 text-[11px] font-semibold transition-colors",
                mobileView === "positions"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              Positions
            </button>
            <button
              type="button"
              onClick={() => setMobileOrderOpen(true)}
              className={cn(
                "h-8 min-w-[70px] rounded-full px-3 text-[11px] font-semibold transition-colors",
                mobileOrderOpen
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              Order
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-2 pb-3">
        <div className="h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-[0_10px_28px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_35px_rgba(0,0,0,0.3)]">
          {mobileViewNode}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <GlobalSearchModal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        searchMode="OPTION"
        placeholder="Search option contracts…"
        onSelectStock={handleSearchSelect}
      />

      <div className="h-[calc(100dvh-6rem)] md:h-[calc(100vh-32px)] min-h-0 overflow-hidden bg-background">
        <AdaptiveTradeLayout
          header={isMobile ? undefined : headerNode}
          footer={<BottomBar />}
          desktopCenter={chainNode}
          desktopRight={
            <div className="h-full min-h-0 overflow-y-auto border-l border-border">{renderPanel()}</div>
          }
          desktopRightWidth={hasPanelContent ? "340px" : "300px"}
          tabletTop={chartNode}
          tabletLeft={<div className="h-full min-h-0 overflow-y-auto">{renderPanel()}</div>}
          tabletRight={chainNode}
          mobileContent={mobileContentNode}
          mobileOrderOpen={mobileOrderOpen}
          onMobileOrderOpenChange={setMobileOrderOpen}
          mobileOrderDrawer={<div className="h-[82vh] min-h-0 overflow-y-auto">{renderPanel(true)}</div>}
        />
      </div>
    </>
  );
}
