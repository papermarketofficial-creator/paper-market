"use client";
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { LineChart } from 'lucide-react';
import { useAnalysisStore } from '@/stores/trading/analysis.store';

interface AnalysisHeaderProps {
  symbol: string;
}

export function AnalysisHeader({ symbol }: AnalysisHeaderProps) {
  const {
    addIndicator,
    removeIndicator,
    getIndicators,
    timeframe,
    setTimeframe
  } = useAnalysisStore();

  const indicators = getIndicators(symbol);

  const handleAdd = (type: 'SMA' | 'RSI' | 'MACD') => {
    addIndicator(symbol, {
      type,
      period: 14,
      source: 'close',
      color: type === 'SMA' ? '#F59E0B' : '#8B5CF6'
    });
  };

  return (
    <div className="flex items-center gap-4">
      <div className="font-bold text-lg text-primary">PaperPro Analysis</div>

      <div className="h-6 w-px bg-border mx-2" />

      {/* Indicator Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <LineChart className="h-4 w-4" />
            Indicators
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => handleAdd('SMA')}>
            Moving Average (SMA 14)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAdd('RSI')}>
            RSI (14)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAdd('MACD')}>
            MACD (12, 26, 9)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Active Indicators Chips */}
      <div className="flex items-center gap-1">
        {indicators.map(ind => (
          <div key={ind.id} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">
            <span>{ind.type} {ind.period || ''}</span>
            <button
              onClick={() => removeIndicator(symbol, ind.id)}
              className="hover:text-destructive"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1 bg-muted p-1 rounded-md">
        {['1m', '5m', '15m', '1H'].map(tf => (
          <Button
            key={tf}
            variant={timeframe === tf ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTimeframe(tf)}
            className="h-7 px-2 text-xs"
          >
            {tf}
          </Button>
        ))}
      </div>
    </div>
  );
}
