"use client";
import { useMemo } from 'react';
import { useRiskStore } from '@/stores/trading/risk.store';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

export function EquityCurveChart() {
  const equityHistory = useRiskStore((state) => state.equityHistory);

  // Data Transformation: Calculate Running Peak & Drawdown
  const chartData = useMemo(() => {
    let peak = 0;
    
    return equityHistory.map((point) => {
      if (point.value > peak) peak = point.value;
      const drawdown = point.value - peak; // Currency Drawdown
      
      return {
        time: point.time,
        equity: point.value,
        drawdown: drawdown,
        peak: peak
      };
    });
  }, [equityHistory]);

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
    return value.toString();
  };

  const formatDate = (time: number) => format(new Date(time), 'dd MMM');

  if (chartData.length === 0) return null;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="py-4">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Equity & Drawdown
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[300px] w-full pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis 
              dataKey="time" 
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            {/* Equity Axis (Right) */}
            <YAxis 
              yAxisId="equity"
              orientation="right"
              tickFormatter={formatCurrency}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              domain={['auto', 'auto']}
            />
            {/* Drawdown Axis (Left, hidden scale mostly, mapped to bottom) */}
            <YAxis 
              yAxisId="drawdown"
              orientation="left"
              hide={true} 
              domain={['dataMin', 0]} // Keep drawdown at bottom
            />
            
            <Tooltip 
              contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", fontSize: "12px" }}
              labelFormatter={(label) => format(new Date(label), 'dd MMM HH:mm')}
              formatter={(value: number, name: string) => [
                `₹${value.toLocaleString()}`, 
                name === 'equity' ? 'Balance' : 'Drawdown'
              ]}
              cursor={{ stroke: "hsl(var(--muted-foreground))", opacity: 0.2 }}
            />

            {/* Zero Line for Drawdown */}
            <ReferenceLine y={0} yAxisId="drawdown" stroke="hsl(var(--border))" />

            {/* Drawdown Area (Red, Bottom) */}
            <Area
              yAxisId="drawdown"
              type="monotone"
              dataKey="drawdown"
              stroke="transparent"
              fill="#ef4444"
              fillOpacity={0.15}
              isAnimationActive={false}
            />

            {/* Equity Line (Green, Top) */}
            <Line
              yAxisId="equity"
              type="monotone"
              dataKey="equity"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}