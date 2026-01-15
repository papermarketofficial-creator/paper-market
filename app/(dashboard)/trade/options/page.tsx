"use client";
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { TradingForm } from '@/components/trade/TradingForm';
import { OptionsChain } from '@/components/trade/OptionsChain';
import { Stock } from '@/types/equity.types';
import { useGlobalStore } from '@/stores/global.store';
import { useMarketStore } from '@/stores/trading/market.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InstrumentType } from '@/components/trade/form/InstrumentSelector';
import { Button } from '@/components/ui/button';
import { Maximize2 } from 'lucide-react';
import { useAnalysisStore } from '@/stores/trading/analysis.store';

// Dynamic import for Chart to avoid SSR issues
const CandlestickChartComponent = dynamic(() => import('@/components/trade/CandlestickChart').then(mod => ({ default: mod.CandlestickChart })), {
  loading: () => <Skeleton className="h-[400px] w-full rounded-lg" />,
  ssr: false
});

export default function OptionsPage() {
  const { getCurrentInstruments } = useMarketStore();
  const { selectedSymbol, setSelectedSymbol } = useGlobalStore();
  const { setAnalysisMode } = useAnalysisStore();

  // ✅ Explicitly fetch options
  const currentInstruments = getCurrentInstruments('options');
  const [selectedStock, setSelectedStock] = useState<Stock | null>(currentInstruments[0]);

  // Controls the Chart & Form Instrument (NIFTY/BANKNIFTY)
  // Replaced local state with Global Store
  const instrumentType = selectedSymbol;
  const setInstrumentType = setSelectedSymbol;

  useEffect(() => {
    if (currentInstruments.length > 0 && !selectedStock) {
      setSelectedStock(currentInstruments[0]);
    }
  }, [currentInstruments, selectedStock]);

  return (
    <div className="space-y-6 p-1">
      {/* Top Section: Trading Form & Indices Chart Side-by-Side */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left: Trading Form */}
        <div className="lg:col-span-4 space-y-4">
          <TradingForm
            selectedStock={selectedStock}
            onStockSelect={setSelectedStock}
            instruments={currentInstruments}
            instrumentMode="options"
            activeInstrumentType={instrumentType}
            onInstrumentTypeChange={setInstrumentType}
          />
        </div>

        {/* Right: Indices Chart */}
        <div className="lg:col-span-8 h-[600px]">
          <Card className="h-full border-border flex flex-col shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-card/50">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{instrumentType}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">INDEX</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">INDEX</span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAnalysisMode(true)}
                  className="gap-2 bg-background/80 backdrop-blur shadow-sm hover:bg-background border-primary/20 hover:border-primary h-8"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">Analyze Chart</span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 relative min-h-0 bg-background/50">
              {instrumentType !== "STOCK OPTIONS" ? (
                <div className="absolute inset-0 p-1">
                  <CandlestickChartComponent symbol={instrumentType} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                  <span className="text-4xl">📊</span>
                  <p className="text-sm">Select a specific stock option to view chart</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Section: Option Chain */}
      <div className="w-full">
        <Card className="border-border shadow-sm flex flex-col h-[600px]">
          <CardHeader className="py-3 px-4 border-b bg-card/50">
            <CardTitle className="text-sm font-semibold">Option Chain</CardTitle>
          </CardHeader>
          <div className="flex-1 overflow-auto bg-background/50">
            <OptionsChain
              onStrikeSelect={(symbol) => {
                const option = currentInstruments.find(inst => inst.symbol === symbol);
                if (option) setSelectedStock(option);
              }}
              instrumentType={instrumentType}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}