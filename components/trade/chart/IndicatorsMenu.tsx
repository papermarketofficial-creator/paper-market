"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAnalysisStore, IndicatorType } from "@/stores/trading/analysis.store";

interface IndicatorsMenuProps {
  symbol: string;
}

export function IndicatorsMenu({ symbol }: IndicatorsMenuProps) {
  const { addIndicator, removeIndicator, getIndicators } = useAnalysisStore();
  const activeIndicators = getIndicators(symbol);

  const toggleIndicator = (type: IndicatorType, period: number = 14) => {
    // Check if exists (simple check by type for now, or ID if we want multiple of same type)
    const existing = activeIndicators.find(i => i.type === type);
    
    if (existing) {
      removeIndicator(symbol, existing.id);
    } else {
      // Add defaults
      const config = {
        type,
        period,
        source: 'close',
        color: type === 'SMA' ? '#FFA500' : type === 'EMA' ? '#2196F3' : '#E91E63'
      } as any;

      if (type === 'MACD') {
        config.fastPeriod = 12;
        config.slowPeriod = 26;
        config.signalPeriod = 9;
        config.seriesColors = { macd: '#2962FF', signal: '#FF6D00', histogram: '#26a69a' };
      }

      addIndicator(symbol, { ...config, id: `${type.toLowerCase()}-${Date.now()}` });
    }
  };

  const isActive = (type: IndicatorType) => activeIndicators.some(i => i.type === type);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
           <span>Indicators</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 bg-card border-border">
        <DropdownMenuLabel className="text-xs text-muted-foreground/70 uppercase tracking-wider">Trend</DropdownMenuLabel>
        <DropdownMenuCheckboxItem 
          checked={isActive('SMA')} 
          onCheckedChange={() => toggleIndicator('SMA', 20)}
          className="text-xs focus:bg-accent"
        >
          SMA (20)
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem 
          checked={isActive('EMA')} 
          onCheckedChange={() => toggleIndicator('EMA', 20)}
          className="text-xs focus:bg-accent"
        >
          EMA (20)
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem 
          checked={isActive('BB')} 
          onCheckedChange={() => toggleIndicator('BB', 20)}
          className="text-xs focus:bg-accent"
        >
          Bollinger Bands
        </DropdownMenuCheckboxItem>
        
        <DropdownMenuSeparator className="bg-border/50" />
        
        <DropdownMenuLabel className="text-xs text-muted-foreground/70 uppercase tracking-wider">Oscillators</DropdownMenuLabel>
        <DropdownMenuCheckboxItem 
          checked={isActive('RSI')} 
          onCheckedChange={() => toggleIndicator('RSI', 14)}
          className="text-xs focus:bg-accent"
        >
          RSI (14)
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem 
          checked={isActive('MACD')} 
          onCheckedChange={() => toggleIndicator('MACD')}
          className="text-xs focus:bg-accent"
        >
          MACD (12, 26, 9)
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
