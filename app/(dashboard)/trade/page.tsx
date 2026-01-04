'use client';
"use client";
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { TradingForm } from '@/components/trade/TradingForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stock, stocksList } from '@/data/stocks';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const CandlestickChartComponent = dynamic(() => import('@/components/trade/CandlestickChart').then(mod => ({ default: mod.CandlestickChart })));

const TradePage = () => {
  const [selectedStock, setSelectedStock] = useState<Stock | null>(stocksList[0]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Trade</h1>
        <p className="text-muted-foreground">Execute simulated trades on NSE stocks</p>
      </div>

      {/* Trading Interface */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Trading Form - Left Panel */}
        <div className="lg:col-span-1">
          <TradingForm
            selectedStock={selectedStock}
            onStockSelect={setSelectedStock}
          />
        </div>

        {/* Chart - Right Panel */}
        <div className="lg:col-span-2">
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
        </div>
      </div>
    </div>
  );
};

export default TradePage;
