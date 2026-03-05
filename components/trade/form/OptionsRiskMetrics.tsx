"use client";
import { Stock } from '@/types/equity.types';
import { useMarketStore } from '@/stores/trading/market.store';
import { parseOptionSymbol, calculateOptionRiskMetrics } from '@/lib/fno-utils';

interface OptionsRiskMetricsProps {
  selectedStock: Stock | null;
  quantityValue: number;
  currentPrice: number;
  lotSize: number;
  side: 'BUY' | 'SELL';
}

export function OptionsRiskMetrics({ selectedStock, quantityValue, currentPrice, lotSize, side }: OptionsRiskMetricsProps) {


  const optionDetails = selectedStock ? parseOptionSymbol(selectedStock.symbol) : null;
  const riskMetrics = optionDetails
    ? calculateOptionRiskMetrics(currentPrice, quantityValue, lotSize, optionDetails, side)
    : null;

  if (!riskMetrics) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="p-3 bg-muted rounded-lg space-y-2">
      <h4 className="text-sm font-medium">Risk Metrics</h4>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Max Loss:</span>
          <span className="ml-1 font-medium text-loss">
            {riskMetrics.maxLoss === Infinity ? 'Unlimited' : formatCurrency(riskMetrics.maxLoss)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Max Profit:</span>
          <span className="ml-1 font-medium text-profit">
            {riskMetrics.maxProfit === Infinity ? 'Unlimited' : formatCurrency(riskMetrics.maxProfit)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Breakeven:</span>
          <span className="ml-1 font-medium">
            {formatCurrency(riskMetrics.breakeven)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Capital at Risk:</span>
          <span className="ml-1 font-medium">
            {formatCurrency(riskMetrics.capitalAtRisk)}
          </span>
        </div>
      </div>
    </div>
  );
}