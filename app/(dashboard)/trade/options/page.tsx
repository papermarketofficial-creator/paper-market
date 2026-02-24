"use client";

import { useEffect, useMemo, useState } from "react";
import { GlobalSearchModal } from "@/components/trade/search/GlobalSearchModal";
import { TradingLayout } from "@/components/trade/options/TradingLayout";
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

type TradeMode = "single" | "strategy";

/* ── helpers ──────────────────────────────────────────────────────────────── */
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

/* ══════════════════════════════════════════════════════════════════════════ */
export default function OptionsPage() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [underlying, setUnderlying] = useState("NIFTY");
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [contracts, setContracts] = useState<Stock[]>([]);
  const [selectedContract, setSelectedContract] = useState<Stock | null>(null);
  const [mode, setMode] = useState<TradeMode>("single");

  /* stores */
  const fetchOptionChain = useMarketStore((s) => s.fetchOptionChain);
  const chainKey = useMemo(
    () => buildOptionChainKey(underlying, selectedExpiry || undefined),
    [selectedExpiry, underlying]
  );
  const optionChain = useMarketStore((s) => s.optionChainByKey[chainKey] || null);
  const isFetching = useMarketStore(
    (s) => s.isFetchingChain && s.fetchingOptionChainKey === chainKey
  );
  const selectPrice = useMarketStore((s) => s.selectPrice);
  const selectQuote = useMarketStore((s) => s.selectQuote);

  /* Load contracts for underlying */
  useEffect(() => {
    if (!underlying) { setContracts([]); setSelectedContract(null); setSelectedExpiry(""); return; }
    let cancelled = false;
    const load = async () => {
      const params = new URLSearchParams({ underlying, instrumentType: "OPTION" });
      const res = await fetch(`/api/v1/instruments/derivatives?${params}`, { cache: "no-store" });
      const payload = await res.json();
      const items: Stock[] = payload?.data?.instruments || [];
      if (!cancelled) setContracts(items);
    };
    load().catch(() => { if (!cancelled) setContracts([]); });
    return () => { cancelled = true; };
  }, [underlying]);

  /* Expiry list */
  const expiries = useMemo(() => {
    const keys = new Set<string>();
    for (const item of contracts) {
      const key = toDateKey(item.expiryDate);
      if (key) keys.add(key);
    }
    return Array.from(keys).sort();
  }, [contracts]);

  useEffect(() => {
    if (expiries.length === 0) { setSelectedExpiry(""); return; }
    if (!selectedExpiry || !expiries.includes(selectedExpiry)) setSelectedExpiry(expiries[0]);
  }, [expiries, selectedExpiry]);

  const filteredContracts = useMemo(
    () => (selectedExpiry ? contracts.filter((c) => toDateKey(c.expiryDate) === selectedExpiry) : []),
    [contracts, selectedExpiry]
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

  /* Invalidate selected contract when expiry changes */
  useEffect(() => {
    if (!selectedContract) return;
    const exists = filteredContracts.some(
      (c) => c.instrumentToken === selectedContract.instrumentToken
    );
    if (!exists) setSelectedContract(null);
  }, [filteredContracts, selectedContract]);

  /* Fetch chain (debounced) */
  useEffect(() => {
    if (!underlying) return;
    if (optionChain) return;
    const timer = window.setTimeout(() => {
      fetchOptionChain(underlying, selectedExpiry || undefined).catch(() => undefined);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [fetchOptionChain, optionChain, selectedExpiry, underlying]);

  /* Chain rows */
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

  /* Pricing */
  const underlyingQuote = selectQuote(underlying);
  const chainPrice = Number(optionChain?.underlyingPrice || 0);
  const fallbackPrice = Number(selectPrice(underlying) || 0);
  const underlyingPrice =
    (Number.isFinite(chainPrice) && chainPrice > 0 ? chainPrice : fallbackPrice) || 0;

  const chainChange = Number(optionChain?.underlyingChangePercent || 0);
  const quoteChange = Number(underlyingQuote?.changePercent || 0);
  const changePercent =
    Number.isFinite(chainChange) && chainChange !== 0 ? chainChange : quoteChange;

  /* ATM */
  const atmStrike = useMemo(() => {
    if (!chainRows.length || !Number.isFinite(underlyingPrice) || underlyingPrice <= 0) return null;
    let best = chainRows[0].strike;
    let minD = Math.abs(best - underlyingPrice);
    for (const r of chainRows) {
      const d = Math.abs(r.strike - underlyingPrice);
      if (d < minD) { minD = d; best = r.strike; }
    }
    return best;
  }, [chainRows, underlyingPrice]);

  const daysToExpiry = getDaysToExpiry(selectedExpiry);

  /* Handlers */
  const handleSearchSelect = (stock: Stock) => {
    setUnderlying(resolveUnderlying(stock));
    const exp = toDateKey(stock.expiryDate);
    if (exp) setSelectedExpiry(exp);
    setSelectedContract(stock);
    setSearchOpen(false);
    setMode("single");
  };

  const handleSelectChainSymbol = (symbol: string) => {
    const found =
      filteredContracts.find((c) => c.symbol === symbol) ||
      contracts.find((c) => c.symbol === symbol);
    if (!found) return;

    // Derive the LTP from the option chain rows (the chain API has prices,
    // the derivatives API Stock object typically has price=0).
    let chainLtp = 0;
    for (const row of chainRows) {
      if (row.ce?.symbol === symbol && row.ce.ltp > 0) { chainLtp = row.ce.ltp; break; }
      if (row.pe?.symbol === symbol && row.pe.ltp > 0) { chainLtp = row.pe.ltp; break; }
    }

    // Inject price so OrderPanel has a valid premium from the start
    const contractWithPrice = chainLtp > 0 ? { ...found, price: chainLtp } : found;
    setSelectedContract(contractWithPrice);
    setMode("single");
  };

  /* Right panel content */
  const renderPanel = () => {
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
          onClose={() => setSelectedContract(null)}
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

  /* ── render ── */
  return (
    <>
      <GlobalSearchModal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        searchMode="OPTION"
        placeholder="Search option contracts…"
        onSelectStock={handleSearchSelect}
      />

      <TradingLayout
        hasPanelContent={hasPanelContent}
        header={
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
        }
        chain={
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
        }
        panel={renderPanel()}
        bottomBar={<BottomBar />}
      />
    </>
  );
}
