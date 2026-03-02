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
import { MobileTradeTopBar } from "@/components/trade/mobile/MobileTradeTopBar";
import { PositionsCards } from "@/components/trade/mobile/PositionsCards";
import { useWalletStore } from "@/stores/wallet.store";

type TradeMode = "single" | "strategy";

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

export default function OptionsPage() {
  const walletBalance = useWalletStore((state) => state.balance);

  const [searchOpen, setSearchOpen] = useState(false);
  const [underlying, setUnderlying] = useState("NIFTY");
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [contracts, setContracts] = useState<Stock[]>([]);
  const [selectedContract, setSelectedContract] = useState<Stock | null>(null);
  const [initialSide, setInitialSide] = useState<"BUY" | "SELL">("BUY");
  const [mode, setMode] = useState<TradeMode>("single");
  const [mobileOrderOpen, setMobileOrderOpen] = useState(false);

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
      onModeChange={(m) => {
        setMode(m);
        if (m === "strategy") setSelectedContract(null);
      }}
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
    <div className="h-full min-h-0 overflow-hidden bg-[#0d1422]">
      <CandlestickChartComponent
        symbol={underlying}
        headerSymbol={underlying}
        instrumentKey={symbolToIndexInstrumentKey(underlying) || undefined}
        onSearchClick={() => setSearchOpen(true)}
      />
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

      <div className="h-[calc(100vh-32px)] min-h-0 overflow-hidden bg-[#080c16]">
        <AdaptiveTradeLayout
          header={headerNode}
          footer={<BottomBar />}
          desktopCenter={chainNode}
          desktopRight={
            <div className="h-full min-h-0 overflow-y-auto border-l border-white/[0.06]">{renderPanel()}</div>
          }
          desktopRightWidth={hasPanelContent ? "340px" : "300px"}
          tabletTop={chartNode}
          tabletLeft={<div className="h-full min-h-0 overflow-y-auto">{renderPanel()}</div>}
          tabletRight={chainNode}
          mobileTopBar={
            <MobileTradeTopBar
              instrumentLabel={underlying}
              ltp={underlyingPrice}
              changePercent={changePercent}
              balanceLabel={formatBalance(walletBalance)}
              onBuy={() => {
                setMode("single");
                setInitialSide("BUY");
                setMobileOrderOpen(true);
              }}
              onSell={() => {
                setMode("single");
                setInitialSide("SELL");
                setMobileOrderOpen(true);
              }}
            />
          }
          mobileTabs={[
            { id: "chart", label: "Chart", content: chartNode, keepMounted: true },
            { id: "order", label: "Order", onSelect: () => setMobileOrderOpen(true) },
            { id: "positions", label: "Positions", content: <PositionsCards instrumentFilter="options" /> },
            {
              id: "chain",
              label: "Option Chain",
              content: (
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
              ),
            },
            ...(mode === "strategy"
              ? [
                  {
                    id: "strategy",
                    label: "Strategy",
                    content: (
                      <div className="h-full min-h-0 overflow-y-auto">{renderPanel(true)}</div>
                    ),
                  },
                ]
              : []),
          ]}
          mobileDefaultTab="chart"
          mobileOrderOpen={mobileOrderOpen}
          onMobileOrderOpenChange={setMobileOrderOpen}
          mobileOrderDrawer={<div className="h-[82vh] min-h-0 overflow-y-auto">{renderPanel(true)}</div>}
        />
      </div>
    </>
  );
}

