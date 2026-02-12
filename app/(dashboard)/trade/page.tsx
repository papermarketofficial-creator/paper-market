"use client";
import { useState, useEffect, Suspense, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { TradingForm } from '@/components/trade/TradingForm';
import { Stock } from '@/types/equity.types';
import { useMarketStore } from '@/stores/trading/market.store';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TradeLayout } from '@/components/trade/layout/TradeLayout';
import { WatchlistPanel } from '@/components/trade/watchlist/WatchlistPanel';
import { GlobalSearchModal } from '@/components/trade/search/GlobalSearchModal';

const CandlestickChartComponent = dynamic(
  () => import('@/components/trade/CandlestickChart').then((mod) => ({ default: mod.CandlestickChart })),
  { ssr: false }
);

export default function TradePage() {
  const { stocks, stocksBySymbol, initializeSimulation } = useMarketStore();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedFallback, setSelectedFallback] = useState<Stock | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const selectedStock = useMemo(() => {
    if (!selectedSymbol) return null;
    return stocksBySymbol[selectedSymbol] || selectedFallback;
  }, [selectedSymbol, selectedFallback, stocksBySymbol]);

  useEffect(() => {
    let active = true;

    const init = async () => {
      const lastSymbol = typeof window !== 'undefined' ? localStorage.getItem('lastTradeSymbol') : null;
      if (!lastSymbol) return;

      if (active) setSelectedSymbol(lastSymbol);

      const existing = useMarketStore.getState().stocksBySymbol[lastSymbol];
      if (!existing) {
        try {
          const res = await fetch(`/api/v1/instruments/search?q=${lastSymbol}`);
          const data = await res.json();

          if (active && data.success && data.data.length > 0) {
            const match = data.data.find((i: any) => i.tradingsymbol === lastSymbol) || data.data[0];
            setSelectedFallback({
              symbol: match.tradingsymbol,
              name: match.name,
              price: parseFloat(match.lastPrice),
              change: 0,
              changePercent: 0,
              volume: 0,
              lotSize: match.lotSize || 1,
              instrumentToken: match.instrumentToken,
            });
          }
        } catch (e) {
          console.error('Failed to restore stock details', e);
        }
      }

      initializeSimulation(lastSymbol, '1d').catch(console.error);
    };

    init();
    return () => {
      active = false;
    };
  }, [initializeSimulation]);

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
    setSelectedSymbol(stock.symbol);
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

      <div className="h-[calc(100vh-3.5rem)] overflow-hidden">
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
                    <CandlestickChartComponent symbol={selectedSymbol} onSearchClick={() => setSearchModalOpen(true)} />
                  </div>
                </Suspense>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Select a stock to view chart</div>
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
                    <TradingForm
                      selectedStock={selectedStock}
                      onStockSelect={handleSelectStock}
                      instruments={stocks}
                      instrumentMode="equity"
                    />
                  </div>
                </div>
              </div>
            )
          }
        />
      </div>
    </>
  );
}
