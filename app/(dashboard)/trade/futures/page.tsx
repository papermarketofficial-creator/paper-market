"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { GlobalSearchModal } from "@/components/trade/search/GlobalSearchModal";
import { FuturesTradeForm } from "@/components/trade/FuturesTradeForm";
import { Stock } from "@/types/equity.types";
import { symbolToIndexInstrumentKey } from "@/lib/market/symbol-normalization";
import { CandlestickChart, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const CandlestickChartComponent = dynamic(
  () =>
    import("@/components/trade/CandlestickChart").then((mod) => ({
      default: mod.CandlestickChart,
    })),
  {
    loading: () => <Skeleton className="h-[400px] w-full rounded-lg" />,
    ssr: false,
  }
);

function normalizeKey(value: string): string {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function resolveUnderlyingName(stock: Stock): string {
  const raw = String(stock.name || stock.symbol || "").trim();
  if (!raw) return "";

  const key = normalizeKey(raw);
  if (key.includes("NIFTYBANK")) return "BANKNIFTY";
  if (key.includes("NIFTYFINSERVICE")) return "FINNIFTY";
  if (key.includes("MIDCPNIFTY") || key.includes("MIDCAP")) return "MIDCAP";
  if (key.includes("NIFTY50") || key === "NIFTY") return "NIFTY";
  if (key.includes("SENSEX")) return "SENSEX";

  return raw.toUpperCase();
}

function resolveChartSymbol(stock: Stock | null): string {
  if (!stock) return "NIFTY";
  return resolveUnderlyingName(stock) || stock.symbol;
}

function isIndexUnderlying(value: string): boolean {
  const key = normalizeKey(value);
  return (
    key === "NIFTY" ||
    key === "BANKNIFTY" ||
    key === "FINNIFTY" ||
    key === "SENSEX" ||
    key === "MIDCAP" ||
    key === "MIDCPNIFTY"
  );
}

export default function FuturesPage() {
  const [currentInstruments, setCurrentInstruments] = useState<Stock[]>([]);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  useEffect(() => {
    if (!selectedStock) {
      setCurrentInstruments([]);
      return;
    }

    let cancelled = false;
    const underlying = resolveUnderlyingName(selectedStock);

    const loadSiblingContracts = async () => {
      const params = new URLSearchParams({
        underlying,
        instrumentType: "FUTURE",
      });

      const res = await fetch(`/api/v1/instruments/derivatives?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await res.json();
      const contracts: Stock[] = payload?.data?.instruments || [];

      if (cancelled) return;

      setCurrentInstruments(contracts);
      if (!selectedStock.instrumentToken) return;

      const exact = contracts.find(
        (item) => item.instrumentToken === selectedStock.instrumentToken
      );
      if (exact && exact.symbol !== selectedStock.symbol) {
        setSelectedStock(exact);
      }
    };

    loadSiblingContracts().catch(() => {
      if (!cancelled) {
        setCurrentInstruments([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedStock?.instrumentToken, selectedStock?.name, selectedStock?.symbol]);

  const chartBinding = useMemo(() => {
    const headerSymbol = selectedStock?.symbol || "FUTURES";
    if (!selectedStock) {
      return {
        symbol: "NIFTY",
        instrumentKey: symbolToIndexInstrumentKey("NIFTY") || undefined,
        headerSymbol,
      };
    }

    const underlying = resolveUnderlyingName(selectedStock);
    if (isIndexUnderlying(underlying)) {
      // Keep index futures chart stable by pinning to index underlying.
      return {
        symbol: underlying,
        instrumentKey: symbolToIndexInstrumentKey(underlying) || undefined,
        headerSymbol,
      };
    }

    // Stock futures must chart by selected contract token.
    return {
      symbol: selectedStock.symbol || underlying,
      instrumentKey: selectedStock.instrumentToken || undefined,
      headerSymbol,
    };
  }, [selectedStock]);

  return (
    <>
      <GlobalSearchModal
        open={searchModalOpen}
        onOpenChange={setSearchModalOpen}
        searchMode="FUTURE"
        placeholder="Search futures contracts..."
        onSelectStock={(stock) => {
          // Drop stale sibling contracts immediately so form effects
          // cannot snap selection back to the previous underlying.
          setCurrentInstruments([]);
          setSelectedStock(stock);
          setSearchModalOpen(false);
        }}
      />

      <div className="h-full min-h-0 overflow-hidden bg-[#080c16]">
        <div className="h-full min-h-0 grid gap-2 p-2 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="min-h-0 h-full">
            <FuturesTradeForm
              selectedStock={selectedStock}
              onStockSelect={setSelectedStock}
              instruments={currentInstruments}
              onOpenSearch={() => setSearchModalOpen(true)}
            />
          </div>

          <div className="min-h-0 h-full">
            <div className="h-full min-h-0 border border-white/[0.06] bg-[#0d1422] flex flex-col">
              <div className="shrink-0 flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
                <div className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
                  Futures Chart
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.08]"
                  onClick={() => setSearchModalOpen(true)}
                >
                  <Search className="mr-1.5 h-3.5 w-3.5" />
                  Search
                </Button>
              </div>

              <div className="flex-1 p-1 relative min-h-0">
                {selectedStock ? (
                  <div className="absolute inset-0">
                    <CandlestickChartComponent
                      symbol={chartBinding.symbol}
                      headerSymbol={chartBinding.headerSymbol}
                      instrumentKey={chartBinding.instrumentKey}
                      onSearchClick={() => setSearchModalOpen(true)}
                    />
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="w-full max-w-sm text-center px-6">
                      <div className="mx-auto mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.02]">
                        <CandlestickChart className="h-4 w-4 text-slate-300" />
                      </div>
                      <p className="text-base font-semibold text-white">Select a contract to load chart</p>
                      <p className="text-sm mt-1.5 text-slate-400">
                        Search index or stock futures to begin.
                      </p>
                      <div className="mt-4">
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 text-xs bg-[#2d6cff] hover:bg-[#3c76ff] text-white"
                          onClick={() => setSearchModalOpen(true)}
                        >
                          <Search className="mr-1.5 h-3.5 w-3.5" />
                          Search Contract
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
