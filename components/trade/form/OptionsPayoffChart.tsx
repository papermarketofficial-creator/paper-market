"use client";
import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import { Stock } from '@/content/watchlist';
import { parseOptionSymbol } from '@/lib/fno-utils';
import { generateCallPayoff, generatePutPayoff } from '@/lib/fno-payoff-utils';

interface OptionsPayoffChartProps {
  selectedStock: Stock | null;
  quantityValue: number; // Number of lots (from UI input)
  currentPrice: number;  // Premium
  lotSize: number;
  side: 'BUY' | 'SELL';
}

export function OptionsPayoffChart({
  selectedStock,
  quantityValue,
  currentPrice,
  lotSize,
  side
}: OptionsPayoffChartProps) {
  // 1. Validation: Only show for valid Options and BUY side (Utils limit)
  const optionDetails = useMemo(() => {
    if (!selectedStock || side !== 'BUY') return null;
    return parseOptionSymbol(selectedStock.symbol);
  }, [selectedStock, side]);

  // 2. Data Generation
  const chartData = useMemo(() => {
    if (!optionDetails) return [];

    const params = {
      strikePrice: optionDetails.strike,
      premium: currentPrice,
      lotSize: lotSize,
      numberOfLots: quantityValue,
    };

    return optionDetails.type === 'CE'
      ? generateCallPayoff(params)
      : generatePutPayoff(params);
  }, [optionDetails, currentPrice, lotSize, quantityValue]);

  if (!optionDetails || chartData.length === 0) return null;

  // 3. Calculate Gradient Offset for Green/Red split
  const gradientOffset = () => {
    const dataMax = Math.max(...chartData.map((i) => i.pnl));
    const dataMin = Math.min(...chartData.map((i) => i.pnl));

    if (dataMax <= 0) return 0;
    if (dataMin >= 0) return 1;

    return dataMax / (dataMax - dataMin);
  };

  const off = gradientOffset();

  const formatCurrency = (value: number) => {
    if (value >= 100000 || value <= -100000) return `${(value / 1000).toFixed(0)}k`;
    return value.toString();
  };

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Payoff at Expiry</h4>
        <span className="text-xs text-muted-foreground">Long {optionDetails.type}</span>
      </div>
      
      <div className="h-[200px] w-full border rounded-md bg-card/50 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset={off} stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset={off} stopColor="#ef4444" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="price" 
              type="number" 
              domain={['auto', 'auto']}
              tickFormatter={(val) => `${val}`}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              minTickGap={30}
            />
            <YAxis 
              tickFormatter={formatCurrency}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", fontSize: "12px" }}
              itemStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(value: number) => [`₹${value.toFixed(2)}`, 'P&L']}
              labelFormatter={(label) => `Price: ${label}`}
            />
            <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
            <Area
              type="monotone"
              dataKey="pnl"
              stroke="#8884d8"
              strokeWidth={2}
              fill="url(#splitColor)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}