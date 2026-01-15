"use client";
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { TradingForm } from '@/components/trade/TradingForm';
import { Stock } from '@/types/equity.types';
import { useGlobalStore } from '@/stores/global.store';
import { useMarketStore } from '@/stores/trading/market.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Maximize2 } from 'lucide-react';
import { useAnalysisStore } from '@/stores/trading/analysis.store';

// Dynamic import for Chart
const CandlestickChartComponent = dynamic(() => import('@/components/trade/CandlestickChart').then(mod => ({ default: mod.CandlestickChart })), {
  loading: () => <Skeleton className="h-[400px] w-full rounded-lg" />,
  ssr: false
});

export default function FuturesPage() {
  const { getCurrentInstruments } = useMarketStore();
  const { selectedSymbol, setSelectedSymbol } = useGlobalStore();
  const { setAnalysisMode } = useAnalysisStore();

  // ✅ Explicitly fetch futures
  const currentInstruments = getCurrentInstruments('futures');
  const [selectedStock, setSelectedStock] = useState<Stock | null>(currentInstruments[0]);

  // Controls the Chart & Form Instrument (NIFTY/BANKNIFTY)
  const instrumentType = selectedSymbol;
  const setInstrumentType = setSelectedSymbol;

  useEffect(() => {
    if (currentInstruments.length > 0 && !selectedStock) {
      setSelectedStock(currentInstruments[0]);
    }
  }, [currentInstruments, selectedStock]);

  return (
    <div className="space-y-6 p-1">
      {/* Top Section: Trading Form & Futures Chart Side-by-Side */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left: Trading Form */}
        <div className="lg:col-span-4 xl:col-span-4">
          <TradingForm
            selectedStock={selectedStock}
            onStockSelect={setSelectedStock}
            instruments={currentInstruments}
            instrumentMode="futures"
            activeInstrumentType={instrumentType}
            onInstrumentTypeChange={setInstrumentType}
          />
        </div>

        {/* Right: Indices Chart */}
        <div className="lg:col-span-8 xl:col-span-8 h-[500px]">
          <Card className="h-full border-border flex flex-col shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-card/50">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{instrumentType}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">FUTURES</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">FUTURES</span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAnalysisMode(true)}
                  className="gap-2 bg-background/80 backdrop-blur shadow-sm hover:bg-background border-primary/20 hover:border-primary h-8"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">Expand Chart</span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 relative min-h-0 bg-background/50">
              <div className="absolute inset-0 p-1">
                <CandlestickChartComponent symbol={instrumentType} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Section: Info / Placeholder */}
      <div className="w-full">
        <Card className="h-full border-border border-dashed bg-muted/20 flex items-center justify-center min-h-[200px]">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Market Depth & Contract Specifics</p>
            <p className="text-xs text-muted-foreground/60">Select a contract to view specific details</p>
          </div>
        </Card>
      </div>
    </div>
  );
}