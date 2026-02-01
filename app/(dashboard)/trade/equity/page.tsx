"use client";
import { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { TradingForm } from '@/components/trade/TradingForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stock } from '@/types/equity.types';
import { useMarketStore } from '@/stores/trading/market.store';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Maximize2 } from 'lucide-react';
import { useAnalysisStore } from '@/stores/trading/analysis.store';

import { GlobalSearchModal } from '@/components/trade/search/GlobalSearchModal';

const CandlestickChartComponent = dynamic(() => import('@/components/trade/CandlestickChart').then(mod => ({ default: mod.CandlestickChart })));

export default function EquityPage() {
  const { getCurrentInstruments } = useMarketStore();
  const { setAnalysisMode } = useAnalysisStore();
  
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // ✅ Explicitly fetch equity instruments
  const currentInstruments = getCurrentInstruments('equity');
  const [selectedStock, setSelectedStock] = useState<Stock | null>(currentInstruments[0]);

  useEffect(() => {
    if (currentInstruments.length > 0 && !selectedStock) {
      setSelectedStock(currentInstruments[0]);
    }
  }, [currentInstruments, selectedStock]);

  // State for Floating Order Form
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');

  // Listen for Chart Triggers (Window Event Hack for decoupled sibling comms without Context for now)
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
              instruments={currentInstruments}
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
                    <CandlestickChartComponent symbol={selectedStock.symbol} />
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
                  {/* Reuse TradingForm but wrapped */}
                  <div className="h-auto max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-card">
                     <TradingForm
                        selectedStock={selectedStock}
                        onStockSelect={setSelectedStock}
                        instruments={currentInstruments}
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

// Imports needed for above code
 import { TradeLayout } from '@/components/trade/layout/TradeLayout';
 import { WatchlistPanel } from '@/components/trade/watchlist/WatchlistPanel';