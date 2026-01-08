"use client";
import { useState, useEffect } from 'react';
import { TradingForm } from '@/components/trade/TradingForm';
import { OptionsChain } from '@/components/trade/OptionsChain';
import { Stock } from '@/types/equity.types';
import { useMarketStore } from '@/stores/trading/market.store';

export default function OptionsPage() {
  const { getCurrentInstruments } = useMarketStore();
  
  // ✅ Explicitly fetch options
  const currentInstruments = getCurrentInstruments('options');
  const [selectedStock, setSelectedStock] = useState<Stock | null>(currentInstruments[0]);

  useEffect(() => {
    if (currentInstruments.length > 0 && !selectedStock) {
      setSelectedStock(currentInstruments[0]);
    }
  }, [currentInstruments, selectedStock]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <TradingForm
          selectedStock={selectedStock}
          onStockSelect={setSelectedStock}
          instruments={currentInstruments}
          instrumentMode="options" // ✅ Explicit Prop
        />
      </div>

      <div className="lg:col-span-2">
        <OptionsChain onStrikeSelect={(symbol) => {
          const option = currentInstruments.find(inst => inst.symbol === symbol);
          if (option) setSelectedStock(option);
        }} />
      </div>
    </div>
  );
}