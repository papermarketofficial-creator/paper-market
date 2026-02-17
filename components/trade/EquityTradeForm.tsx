"use client";

import { TradingForm } from "@/components/trade/TradingForm";
import { Stock } from "@/types/equity.types";

interface EquityTradeFormProps {
  selectedStock: Stock | null;
  onStockSelect: (stock: Stock) => void;
  instruments: Stock[];
}

export function EquityTradeForm({
  selectedStock,
  onStockSelect,
  instruments,
}: EquityTradeFormProps) {
  return (
    <TradingForm
      selectedStock={selectedStock}
      onStockSelect={onStockSelect}
      instruments={instruments}
      instrumentMode="equity"
    />
  );
}

