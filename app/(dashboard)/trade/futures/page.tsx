"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { GlobalSearchModal } from "@/components/trade/search/GlobalSearchModal";
import { FuturesTradeForm } from "@/components/trade/FuturesTradeForm";
import { Stock } from "@/types/equity.types";
import { symbolToIndexInstrumentKey } from "@/lib/market/symbol-normalization";

const CandlestickChartComponent = dynamic(
  () =>
    import("@/components/trade/CandlestickChart").then((mod) => ({
      default: mod.CandlestickChart,
    })),
  {
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
    ssr: false,
  },
);

function normalizeKey(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
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

      const res = await fetch(
        `/api/v1/instruments/derivatives?${params.toString()}`,
        {
          cache: "no-store",
        },
      );
      const payload = await res.json();
      const contracts: Stock[] = payload?.data?.instruments || [];

      if (cancelled) return;

      setCurrentInstruments(contracts);
      if (!selectedStock.instrumentToken) return;

      const exact = contracts.find(
        (item) => item.instrumentToken === selectedStock.instrumentToken,
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
  }, [
    selectedStock?.instrumentToken,
    selectedStock?.name,
    selectedStock?.symbol,
  ]);

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
      return {
        symbol: underlying,
        instrumentKey: symbolToIndexInstrumentKey(underlying) || undefined,
        headerSymbol,
      };
    }

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
          setCurrentInstruments([]);
          setSelectedStock(stock);
          setSearchModalOpen(false);
        }}
      />

      {/* Single full-height grid — no duplicated search */}
      <div className="h-[calc(100vh-32px)] min-h-0 overflow-hidden bg-[#080c16]">
        <div className="h-full min-h-0 grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* LEFT: Order form panel */}
          <div className="min-h-0 h-full border-r border-white/[0.06]">
            <FuturesTradeForm
              selectedStock={selectedStock}
              onStockSelect={setSelectedStock}
              instruments={currentInstruments}
              onOpenSearch={() => setSearchModalOpen(true)}
            />
          </div>

          {/* RIGHT: Chart — fills remaining height exactly */}
          <div className="min-h-0 h-full flex flex-col bg-[#0d1422]">
            {selectedStock ? (
              <div className="flex-1 min-h-0 relative">
                <div className="absolute inset-0">
                  <CandlestickChartComponent
                    symbol={chartBinding.symbol}
                    headerSymbol={chartBinding.headerSymbol}
                    instrumentKey={chartBinding.instrumentKey}
                    onSearchClick={() => setSearchModalOpen(true)}
                  />
                </div>
              </div>
            ) : (
              /* Empty state — single search entry point */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center px-8 max-w-xs">
                  <div className="mb-5 mx-auto w-16 h-16 rounded-2xl bg-[#2d6cff]/10 border border-[#2d6cff]/20 flex items-center justify-center">
                    <svg
                      className="w-7 h-7 text-[#2d6cff]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
                      />
                    </svg>
                  </div>
                  <h2 className="text-base font-bold text-white mb-1.5">
                    Futures Terminal
                  </h2>
                  <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                    Search any index or stock futures contract to view live
                    chart and place orders.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchModalOpen(true)}
                    className="w-full h-10 rounded-lg bg-[#2d6cff] hover:bg-[#3c76ff] text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                    Search Futures Contract
                  </button>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {["NIFTY FUT", "BANKNIFTY FUT", "FINNIFTY FUT"].map(
                      (label) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setSearchModalOpen(true)}
                          className="rounded-md bg-white/[0.04] border border-white/[0.06] px-2 py-1.5 text-[10px] font-semibold text-slate-500 hover:text-slate-300 hover:bg-white/[0.08] transition-colors"
                        >
                          {label}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
