"use client";
import { Stock } from '@/types/equity.types';

interface RiskPreviewProps {
  selectedStock: Stock | null;
  quantityValue: number;
  currentPrice: number;
  balance: number;
}

export function RiskPreview({ selectedStock, quantityValue, currentPrice, balance }: RiskPreviewProps) {
  if (!selectedStock || quantityValue <= 0) return null;

  return (
    <div className="p-3 bg-muted rounded-lg">
      <p className="text-sm font-medium">Position Size: {((currentPrice * quantityValue) / balance * 100).toFixed(1)}% of portfolio</p>
      <p className="text-xs text-muted-foreground">Recommended: Keep under 5% for risk management</p>
    </div>
  );
}