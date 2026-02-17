"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GlobalSearchModal } from "@/components/trade/search/GlobalSearchModal";
import { FuturesTradeForm } from "@/components/trade/FuturesTradeForm";
import { Stock } from "@/types/equity.types";
import { symbolToIndexInstrumentKey } from "@/lib/market/symbol-normalization";
import { ArrowRight, CandlestickChart, Search } from "lucide-react";
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

      <div className="h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col gap-2 p-1">
        <div className="flex-1 min-h-0 grid gap-4 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-4 xl:col-span-4 min-h-0 h-full">
            <FuturesTradeForm
              selectedStock={selectedStock}
              onStockSelect={setSelectedStock}
              instruments={currentInstruments}
              onOpenSearch={() => setSearchModalOpen(true)}
            />
          </div>

          <div className="lg:col-span-8 xl:col-span-8 min-h-0 h-full">
            <Card className="h-full border-border flex flex-col shadow-sm">
              <CardContent className="flex-1 p-0 relative min-h-0 bg-background/50">
                {selectedStock ? (
                  <div className="absolute inset-0 p-1">
                    <CandlestickChartComponent
                      symbol={chartBinding.symbol}
                      headerSymbol={chartBinding.headerSymbol}
                      instrumentKey={chartBinding.instrumentKey}
                      onSearchClick={() => setSearchModalOpen(true)}
                    />
                  </div>
                ) : (
                  <div className="h-full p-6">
                    <div className="h-full rounded-sm border border-border/60 bg-gradient-to-b from-muted/25 to-background/40 flex items-center justify-center">
                      <div className="max-w-md text-center px-6">
                        <div className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/70">
                          <CandlestickChart className="h-5 w-5 text-primary" />
                        </div>
                        <p className="text-base font-semibold text-foreground">Chart Awaits Contract Selection</p>
                        <p className="text-sm mt-2 text-muted-foreground">
                          Pick any index or stock futures contract to load live chart, expiries, and order controls.
                        </p>
                        <div className="mt-5 flex items-center justify-center gap-2">
                          <Button type="button" size="sm" className="h-8 text-xs" onClick={() => setSearchModalOpen(true)}>
                            <Search className="mr-1.5 h-3.5 w-3.5" />
                            Search Contract
                          </Button>
                         
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
