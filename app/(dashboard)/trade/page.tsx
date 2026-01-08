'use client';
"use client";
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { TradingForm } from '@/components/trade/TradingForm';
import { OptionsChain } from '@/components/trade/OptionsChain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Stock } from '@/content/watchlist';
import { useMarketStore } from '@/stores/trading/market.store';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const CandlestickChartComponent = dynamic(() => import('@/components/trade/CandlestickChart').then(mod => ({ default: mod.CandlestickChart })));

const TradePage = () => {
  const { instrumentMode, setInstrumentMode, getCurrentInstruments } = useMarketStore();
  const currentInstruments = getCurrentInstruments();
  const [selectedStock, setSelectedStock] = useState<Stock | null>(currentInstruments[0]);

  useEffect(() => {
    setSelectedStock(currentInstruments[0] || null);
  }, [instrumentMode, currentInstruments]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Trade</h1>
        <p className="text-muted-foreground">Execute simulated trades on NSE instruments</p>
      </div>

      {/* Instrument Mode Selector */}
      <Tabs value={instrumentMode} onValueChange={(value) => setInstrumentMode(value as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="equity">Equity</TabsTrigger>
          <TabsTrigger value="futures">Futures</TabsTrigger>
          <TabsTrigger value="options">Options</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Trading Interface */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Trading Form - Left Panel */}
        <div className="lg:col-span-1">
          <TradingForm
            selectedStock={selectedStock}
            onStockSelect={setSelectedStock}
            instruments={currentInstruments}
          />
        </div>

        {/* Chart / Options Chain - Right Panel */}
        <div className="lg:col-span-2">
          {instrumentMode === 'options' ? (
            <OptionsChain onStrikeSelect={(symbol) => {
              const option = currentInstruments.find(inst => inst.symbol === symbol);
              if (option) setSelectedStock(option);
            }} />
          ) : (
            <Card className="bg-card border-border h-full">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span>{selectedStock?.symbol || 'Select Stock'}</span>
                    {selectedStock && (
                      <span className={cn(
                        'text-sm font-normal',
                        selectedStock.change >= 0 ? 'text-profit' : 'text-loss'
                      )}>
                        ₹{selectedStock.price.toLocaleString('en-IN')}
                        <span className="ml-2">
                          {selectedStock.change >= 0 ? '+' : ''}
                          {selectedStock.change.toFixed(2)} ({selectedStock.changePercent.toFixed(2)}%)
                        </span>
                      </span>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedStock ? (
                  <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
                    <CandlestickChartComponent symbol={selectedStock.symbol} />
                  </Suspense>
                ) : (
                  <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                    Select a stock to view chart
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default TradePage;
