"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import dynamic from "next/dynamic";
import { EquityTradeForm } from "@/components/trade/EquityTradeForm";
import { Stock } from "@/types/equity.types";
import { useMarketStore } from "@/stores/trading/market.store";
import { useWalletStore } from "@/stores/wallet.store";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { WatchlistPanel } from "@/components/trade/watchlist/WatchlistPanel";
import { GlobalSearchModal } from "@/components/trade/search/GlobalSearchModal";
import { PositionsTable } from "@/components/positions/PositionsTable";
import { toCanonicalSymbol } from "@/lib/market/symbol-normalization";
import { AdaptiveTradeLayout } from "@/components/trade/layout/AdaptiveTradeLayout";
import { MobileTradeTopBar } from "@/components/trade/mobile/MobileTradeTopBar";
import { PositionsCards } from "@/components/trade/mobile/PositionsCards";
import { useTradeViewport } from "@/hooks/use-trade-viewport";

const CandlestickChartComponent = dynamic(
  () => import("@/components/trade/CandlestickChart").then((mod) => ({ default: mod.CandlestickChart })),
  { ssr: false },
);

function formatBalance(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `INR ${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function TradePage() {
  const { isMobile, isDesktop } = useTradeViewport();
  const { stocks, stocksBySymbol } = useMarketStore();
  const walletBalance = useWalletStore((state) => state.balance);

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedFallback, setSelectedFallback] = useState<Stock | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [mobileOrderOpen, setMobileOrderOpen] = useState(false);

  const selectedStock = useMemo(() => {
    if (!selectedSymbol) return null;
    return stocksBySymbol[selectedSymbol] || selectedFallback;
  }, [selectedSymbol, selectedFallback, stocksBySymbol]);

  useEffect(() => {
    if (!selectedSymbol) return;
    if (!stocksBySymbol[selectedSymbol]) return;
    if (selectedFallback?.symbol !== selectedSymbol) return;
    setSelectedFallback(null);
  }, [selectedSymbol, selectedFallback, stocksBySymbol]);

  useEffect(() => {
    if (selectedSymbol) {
      localStorage.setItem("lastTradeSymbol", selectedSymbol);
    }
  }, [selectedSymbol]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    (window as any).triggerTrade = (_side: "BUY" | "SELL") => {
      if (isMobile) {
        setMobileOrderOpen(true);
        return;
      }
      setShowOrderForm(true);
    };
    return () => {
      (window as any).triggerTrade = undefined;
    };
  }, [isMobile]);

  const handleSelectStock = (stock: Stock) => {
    setSelectedSymbol(toCanonicalSymbol(stock.symbol));
    setSelectedFallback(stock);
  };

  const chartNode = (
    <div className="h-full w-full bg-card/50">
      {selectedSymbol ? (
        <Suspense fallback={<Skeleton className="h-full w-full" />}>
          <div className="h-full w-full">
            <CandlestickChartComponent
              symbol={selectedSymbol}
              instrumentKey={selectedStock?.instrumentToken}
              onSearchClick={() => setSearchModalOpen(true)}
            />
          </div>
        </Suspense>
      ) : (
        <div className="h-full overflow-auto p-4">
          <PositionsTable />
        </div>
      )}
    </div>
  );

  const watchlistNode = (
    <div className="h-full">
      <WatchlistPanel
        instruments={stocks}
        selectedSymbol={selectedSymbol ?? undefined}
        onSelect={handleSelectStock}
        onOpenSearch={() => setSearchModalOpen(true)}
      />
    </div>
  );

  const orderPanelNode = selectedStock ? (
    <div className="h-full min-h-0 overflow-y-auto">
      <EquityTradeForm selectedStock={selectedStock} onStockSelect={handleSelectStock} instruments={stocks} sheetMode />
    </div>
  ) : (
    <div className="flex h-full items-center justify-center p-4 text-xs text-slate-500">Select a stock to place an order.</div>
  );

  return (
    <>
      <GlobalSearchModal
        open={searchModalOpen}
        onOpenChange={setSearchModalOpen}
        onSelectStock={(stock) => {
          handleSelectStock(stock);
          setSearchModalOpen(false);
        }}
      />

      <div className="h-[calc(100vh-2rem)] min-h-0 overflow-hidden">
        <AdaptiveTradeLayout
          desktopLeft={watchlistNode}
          desktopLeftWidth="360px"
          desktopCenter={
            <div className="relative h-full min-h-0">
              {chartNode}
              {isDesktop && showOrderForm && selectedStock && selectedSymbol ? (
                <div className="absolute right-4 top-16 z-50 w-[340px] animate-in fade-in slide-in-from-right-8 duration-200">
                  <div className="relative rounded-lg border border-border bg-card shadow-2xl">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 z-10 h-7 w-7 rounded-full bg-background/70 hover:bg-background"
                      onClick={() => setShowOrderForm(false)}
                    >
                      <span className="sr-only">Close</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-x"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </Button>
                    <div className="h-auto max-h-[80vh] overflow-y-auto rounded-lg">
                      <EquityTradeForm selectedStock={selectedStock} onStockSelect={handleSelectStock} instruments={stocks} />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          }
          tabletTop={chartNode}
          tabletLeft={watchlistNode}
          tabletRight={orderPanelNode}
          mobileTopBar={
            <MobileTradeTopBar
              instrumentLabel={selectedStock?.symbol || "TRADE"}
              ltp={Number(selectedStock?.price || 0)}
              changePercent={Number(selectedStock?.changePercent || 0)}
              balanceLabel={formatBalance(walletBalance)}
              onBuy={() => (window as any).triggerTrade?.("BUY")}
              onSell={() => (window as any).triggerTrade?.("SELL")}
            />
          }
          mobileTabs={[
            { id: "chart", label: "Chart", content: chartNode, keepMounted: true },
            { id: "watchlist", label: "Watchlist", content: watchlistNode },
            { id: "order", label: "Order", onSelect: () => setMobileOrderOpen(true) },
            { id: "positions", label: "Positions", content: <PositionsCards instrumentFilter="equity" /> },
          ]}
          mobileDefaultTab="chart"
          mobileOrderOpen={mobileOrderOpen}
          onMobileOrderOpenChange={setMobileOrderOpen}
          mobileOrderDrawer={orderPanelNode}
        />
      </div>
    </>
  );
}

