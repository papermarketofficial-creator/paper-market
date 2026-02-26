"use client";
import { useState, useEffect, Suspense, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { EquityTradeForm } from '@/components/trade/EquityTradeForm';
import { Stock } from '@/types/equity.types';
import { useMarketStore } from '@/stores/trading/market.store';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TradeLayout } from '@/components/trade/layout/TradeLayout';
import { WatchlistPanel } from '@/components/trade/watchlist/WatchlistPanel';
import { GlobalSearchModal } from '@/components/trade/search/GlobalSearchModal';
import { PositionsTable } from '@/components/positions/PositionsTable';
import { toCanonicalSymbol } from '@/lib/market/symbol-normalization';

const CandlestickChartComponent = dynamic(
  () => import('@/components/trade/CandlestickChart').then((mod) => ({ default: mod.CandlestickChart })),
  { ssr: false }
);

export default function TradePage() {
  const { stocks, stocksBySymbol } = useMarketStore();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedFallback, setSelectedFallback] = useState<Stock | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

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
      localStorage.setItem('lastTradeSymbol', selectedSymbol);
    }
  }, [selectedSymbol]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [showOrderForm, setShowOrderForm] = useState(false);

  useEffect(() => {
    (window as any).triggerTrade = (_side: 'BUY' | 'SELL') => {
      setShowOrderForm(true);
    };
    return () => {
      (window as any).triggerTrade = undefined;
    };
  }, []);

  const handleSelectStock = (stock: Stock) => {
    setSelectedSymbol(toCanonicalSymbol(stock.symbol));
    setSelectedFallback(stock);
  };

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

      <div className="h-full min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0">
          <TradeLayout
            watchlist={
              <div className="h-full">
                <WatchlistPanel
                  instruments={stocks}
                  selectedSymbol={selectedSymbol ?? undefined}
                  onSelect={handleSelectStock}
                  onOpenSearch={() => setSearchModalOpen(true)}
                />
              </div>
            }
            chart={
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
            }
            orderForm={
              showOrderForm && selectedStock && selectedSymbol && (
                <div className="absolute top-16 right-4 w-[320px] z-50 shadow-2xl animate-in slide-in-from-right-10 fade-in duration-200">
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 z-10 h-6 w-6 rounded-full bg-background/50 hover:bg-background"
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
                    <div className="h-auto max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-card">
                      <EquityTradeForm
                        selectedStock={selectedStock}
                        onStockSelect={handleSelectStock}
                        instruments={stocks}
                      />
                    </div>
                  </div>
                </div>
              )
            }
          />
        </div>
      </div>
    </>
  );
}
