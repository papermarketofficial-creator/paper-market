"use client";
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { OptionsTradeForm } from '@/components/trade/OptionsTradeForm';
import { OptionsChain } from '@/components/trade/OptionsChain';
import { OptionsStrategyEngine } from '@/components/trade/OptionsStrategyEngine';
import { Stock } from '@/types/equity.types';
import { useGlobalStore } from '@/stores/global.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InstrumentType } from '@/components/trade/form/InstrumentSelector';
import { toast } from 'sonner';

// Dynamic import for Chart to avoid SSR issues
const CandlestickChartComponent = dynamic(() => import('@/components/trade/CandlestickChart').then(mod => ({ default: mod.CandlestickChart })), {
  loading: () => <Skeleton className="h-[400px] w-full rounded-lg" />,
  ssr: false
});

const OPTIONS_UNDERLYINGS: InstrumentType[] = [
  "NIFTY",
  "BANKNIFTY",
  "FINNIFTY",
  "SENSEX",
  "MIDCAP",
  "STOCK OPTIONS",
];

export default function OptionsPage() {
  const { selectedSymbol, setSelectedSymbol } = useGlobalStore();

  const [currentInstruments, setCurrentInstruments] = useState<Stock[]>([]);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);

  // Controls the Chart & Form Instrument (NIFTY/BANKNIFTY)
  // Replaced local state with Global Store
  const instrumentType = selectedSymbol;
  const setInstrumentType = setSelectedSymbol;

  useEffect(() => {
    if (instrumentType === "STOCK FUTURES") {
      setInstrumentType("NIFTY");
      return;
    }

    let cancelled = false;

    const loadOptions = async () => {
      const params = new URLSearchParams({
        underlying: instrumentType,
        instrumentType: 'OPTION',
      });

      const res = await fetch(`/api/v1/instruments/derivatives?${params.toString()}`, { cache: 'no-store' });
      const payload = await res.json();
      const instruments: Stock[] = payload?.data?.instruments || [];

      if (!cancelled) {
        setCurrentInstruments(instruments);
        setSelectedStock(instruments[0] || null);
      }
    };

    loadOptions().catch(() => {
      if (!cancelled) {
        setCurrentInstruments([]);
        setSelectedStock(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [instrumentType, setInstrumentType]);

  useEffect(() => {
    if (!selectedStock) return;

    const stillExists = currentInstruments.some(
      (inst) => inst.instrumentToken === selectedStock.instrumentToken
    );

    if (!stillExists) {
      setSelectedStock(currentInstruments[0] || null);
    }
  }, [currentInstruments, selectedStock]);

  return (
    <div className="space-y-6 p-1">
      {/* Top Section: Trading Form & Indices Chart Side-by-Side */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left: Trading Form */}
        <div className="lg:col-span-4 space-y-4">
          <OptionsTradeForm
            selectedStock={selectedStock}
            onStockSelect={setSelectedStock}
            instruments={currentInstruments}
            allowedInstrumentTypes={OPTIONS_UNDERLYINGS}
            activeInstrumentType={instrumentType}
            onInstrumentTypeChange={setInstrumentType}
          />
          <OptionsStrategyEngine
            underlying={instrumentType}
            instruments={currentInstruments}
          />
        </div>

        {/* Right: Indices Chart */}
        <div className="lg:col-span-8 h-[600px]">
          <Card className="h-full border-border flex flex-col shadow-sm">
            <CardHeader className="py-3 px-4 border-b bg-card/50">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{instrumentType}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">INDEX</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">INDEX</span>
                </div>
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
                if (option?.instrumentToken) {
                  setSelectedStock(option);
                } else {
                  toast.error('Instrument resolution failed', {
                    description: `${symbol} is not available in active repository-backed options.`,
                  });
                }
              }}
              instrumentType={instrumentType}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
