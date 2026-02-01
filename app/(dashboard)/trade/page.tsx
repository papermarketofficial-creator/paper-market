"use client";
import { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { TradingForm } from '@/components/trade/TradingForm';
import { Stock } from '@/types/equity.types';
import { useMarketStore } from '@/stores/trading/market.store';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TradeLayout } from '@/components/trade/layout/TradeLayout';
import { WatchlistPanel } from '@/components/trade/watchlist/WatchlistPanel';
import { GlobalSearchModal } from '@/components/trade/search/GlobalSearchModal';

const CandlestickChartComponent = dynamic(() => import('@/components/trade/CandlestickChart').then(mod => ({ default: mod.CandlestickChart })), { ssr: false });

export default function TradePage() {
  const { stocks, fetchWatchlists, initializeSimulation } = useMarketStore();
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // Initial Load & Parallel Fetching
  useEffect(() => {
    const init = async () => {
      // 1. Recover last symbol
      const lastSymbol = typeof window !== 'undefined' ? localStorage.getItem('lastTradeSymbol') : null;
      
      // 2. Optimistically set selected stock ONLY if we have a history
      if (lastSymbol && !selectedStock) {
        // Try to find in existing stocks first
        const existing = stocks.find(s => s.symbol === lastSymbol);
        
        if (existing) {
             setSelectedStock(existing);
        } else {
            // Fetch instrument details via search to get token
            try {
                // We use search to "resolve" the symbol to a token
                const res = await fetch(`/api/v1/instruments/search?q=${lastSymbol}`);
                const data = await res.json();
                if (data.success && data.data.length > 0) {
                     // Find exact match
                     const match = data.data.find((i: any) => i.tradingsymbol === lastSymbol) || data.data[0];
                     
                     setSelectedStock({ 
                        symbol: match.tradingsymbol, 
                        name: match.name, 
                        price: parseFloat(match.lastPrice), 
                        change: 0, 
                        changePercent: 0, 
                        volume: 0, 
                        lotSize: match.lotSize || 1, 
                        instrumentToken: match.instrumentToken 
                      });
                } else {
                    // Fallback to empty token (will show error or loading)
                    setSelectedStock({ 
                      symbol: lastSymbol, 
                      name: lastSymbol, 
                      price: 0, change: 0, changePercent: 0, volume: 0, lotSize: 0, instrumentToken: '' 
                    });
                }
            } catch (e) {
                console.error("Failed to restore stock details", e);
            }
        }
      }

      // 3. Parallel Fetch: Watchlists + (Optional) Chart Data
      const promises: Promise<any>[] = [fetchWatchlists()];
      
      if (lastSymbol) {
          promises.push(initializeSimulation(lastSymbol, '1d'));
      }

      Promise.all(promises).catch(console.error);
    };

    init();
  }, [fetchWatchlists, initializeSimulation, selectedStock, stocks]); // Run on mount and when dependencies change

  // Persist selection
  useEffect(() => {
    if (selectedStock) {
      localStorage.setItem('lastTradeSymbol', selectedStock.symbol);
    }
  }, [selectedStock]);

  // Sync with Watchlist (Optional: Update selected stock object with full details when available)
  useEffect(() => {
    if (stocks.length > 0 && selectedStock) {
      const match = stocks.find(s => s.symbol === selectedStock.symbol);
      if (match) {
        setSelectedStock(prev => prev && prev.price === 0 ? match : prev);
      }
    }
  }, [stocks, selectedStock]);

  // Keyboard shortcut for search modal (Ctrl+K / Cmd+K)
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

  // State for Floating Order Form
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');

  // Listen for Chart Triggers (Window Event Hack)
  useEffect(() => {
    (window as any).triggerTrade = (side: 'BUY' | 'SELL') => {
      setOrderSide(side);
      setShowOrderForm(true);
    };
    return () => {
      (window as any).triggerTrade = undefined;
    }
  }, []);

  return (
    <>
      <GlobalSearchModal 
        open={searchModalOpen} 
        onOpenChange={setSearchModalOpen}
        onSelectStock={(stock) => {
          setSelectedStock(stock);
          setSearchModalOpen(false);
        }}
      />
      
      <div className="h-[calc(100vh-3.5rem)] overflow-hidden">
        <TradeLayout
          watchlist={
            <div className="h-full">
              <WatchlistPanel 
                instruments={stocks}
                selectedSymbol={selectedStock?.symbol}
                onSelect={setSelectedStock}
                onOpenSearch={() => setSearchModalOpen(true)}
              />
            </div>
          }
          chart={
            <div className="h-full w-full bg-card/50">
               {selectedStock ? (
                 <Suspense fallback={<Skeleton className="h-full w-full" />}>
                   <div className="h-full w-full">

                      <CandlestickChartComponent 
                        symbol={selectedStock.symbol} 
                        onSearchClick={() => setSearchModalOpen(true)}
                      />
                   </div>
                 </Suspense>
               ) : (
                 <div className="flex items-center justify-center h-full text-muted-foreground">
                   Select a stock to view chart
                 </div>
               )}
            </div>
          }
          orderForm={
            showOrderForm && selectedStock && (
               <div className="absolute top-16 right-4 w-[320px] z-50 shadow-2xl animate-in slide-in-from-right-10 fade-in duration-200">
                  <div className="relative">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-2 right-2 z-10 h-6 w-6 rounded-full bg-background/50 hover:bg-background"
                      onClick={() => setShowOrderForm(false)}
                    >
                      <span className="sr-only">Close</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </Button>
                    <div className="h-auto max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-card">
                       <TradingForm
                          selectedStock={selectedStock}
                          onStockSelect={setSelectedStock}
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