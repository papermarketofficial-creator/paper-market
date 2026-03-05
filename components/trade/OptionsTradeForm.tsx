"use client";

import { TradingForm } from "@/components/trade/TradingForm";
import { InstrumentType } from "@/components/trade/form/InstrumentSelector";
import { Stock } from "@/types/equity.types";

interface OptionsTradeFormProps {
  selectedStock: Stock | null;
  onStockSelect: (stock: Stock) => void;
  instruments: Stock[];
  sheetMode?: boolean;
  activeInstrumentType?: InstrumentType;
  onInstrumentTypeChange?: (type: InstrumentType) => void;
  allowedInstrumentTypes?: InstrumentType[];
}

export function OptionsTradeForm({
  selectedStock,
  onStockSelect,
  instruments,
  sheetMode = false,
  activeInstrumentType,
  onInstrumentTypeChange,
  allowedInstrumentTypes,
}: OptionsTradeFormProps) {
  return (
    <TradingForm
      selectedStock={selectedStock}
      onStockSelect={onStockSelect}
      instruments={instruments}
      instrumentMode="options"
      sheetMode={sheetMode}
      activeInstrumentType={activeInstrumentType}
      onInstrumentTypeChange={onInstrumentTypeChange}
      allowedInstrumentTypes={allowedInstrumentTypes}
    />
  );
}

