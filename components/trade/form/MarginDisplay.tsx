"use client";
import { Stock } from '@/types/equity.types';
import { cn } from '@/lib/utils';

interface MarginDisplayProps {
  selectedStock: Stock | null;
  currentPrice: number;
  requiredMargin: number;
  balance: number;
}

export function MarginDisplay({ selectedStock, currentPrice, requiredMargin, balance }: MarginDisplayProps) {
  if (!selectedStock) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="space-y-4 rounded-lg bg-muted/30 p-4">
      <div className="flex justify-between">
        <span className="text-sm text-muted-foreground">Market Price</span>
        <span className="text-sm font-medium text-foreground">
          {formatCurrency(currentPrice)}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-sm text-muted-foreground">Required Margin</span>
        <span className={cn(
          'text-sm font-medium',
          requiredMargin > balance ? 'text-loss' : 'text-foreground'
        )}>
          {formatCurrency(requiredMargin)}
        </span>
      </div>
    </div>
  );
}