"use client";

import { useAnalysisStore } from '@/stores/trading/analysis.store';
import { IndicatorsMenu } from './IndicatorsMenu';
import { Button } from '@/components/ui/button';
import { 
 
  Search, 
  Settings, 
  Camera, 
  Maximize, 
  LayoutTemplate, 
  ChevronDown,
  Undo2,
  Redo2,
  CandlestickChart
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface ChartHeaderProps {
  symbol: string;
  isInstantOrderActive: boolean;
  onToggleInstantOrder: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onScreenshot?: () => void;
  onMaximize?: () => void;
  onSearchClick?: () => void;
  isLoading?: boolean;
}

export function ChartHeader({ 
    symbol, 
    isInstantOrderActive, 
    onToggleInstantOrder,
    onUndo,
    onRedo,
    onScreenshot,
    onMaximize,
    onSearchClick,
    isLoading = false
}: ChartHeaderProps) {
  const { range, setRange } = useAnalysisStore();

  const ranges = ['5Y', '1Y', '6M', '3M', '1M', '5D', '1D'];

  return (
    <div className="flex items-center justify-between p-1.5 border-b border-border bg-card z-30 shrink-0 h-11">
      {/* Left Section */}
      <div className="flex items-center gap-1.5 h-full">
        {/* Symbol Search Trigger */}
        <Button 
          variant="ghost" 
          size="sm" 
          disabled={isLoading}
          className="h-8 gap-2 px-2 text-foreground font-medium hover:bg-accent hover:text-foreground disabled:opacity-70"
          onClick={onSearchClick}
        >
          {isLoading ? (
             <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          ) : (
             <Search className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="uppercase">{symbol}</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded-sm border border-border">NSE</span>
        </Button>



        <Separator orientation="vertical" className="h-4 bg-border/50 mx-1" />

        {/* Buy/Sell Buttons (Triggers Side Panel) */}
        <div className="flex items-center gap-1">
            <Button 
                size="sm" 
                className="h-7 px-3 bg-trade-buy hover:bg-trade-buy/90 text-white text-[10px] font-bold uppercase transition-transform active:scale-95"
                onClick={() => (window as any).triggerTrade?.('BUY')}
            >
                Buy
            </Button>
            <Button 
                size="sm" 
                className="h-7 px-3 bg-trade-sell hover:bg-trade-sell/90 text-white text-[10px] font-bold uppercase transition-transform active:scale-95"
                onClick={() => (window as any).triggerTrade?.('SELL')}
            >
                Sell
            </Button>
        </div>

        <Separator orientation="vertical" className="h-4 bg-border/50 mx-1" />

        {/* Range Selector (Upstox-style) */}
        <div className="flex items-center">
            {ranges.map((r) => (
                <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-2 h-7 text-xs font-medium rounded-sm transition-colors uppercase ${
                        range === r
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                >
                    {r}
                </button>
            ))}
        </div>

        <Separator orientation="vertical" className="h-4 bg-border/50 mx-1" />

        {/* Chart Style (Candles) */}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
           <CandlestickChart className="h-4 w-4" />
        </Button>

        {/* Indicators */}
        <IndicatorsMenu symbol={symbol} />

        <Separator orientation="vertical" className="h-4 bg-border/50 mx-1" />
        
       

        
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onUndo}>
              <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onRedo}>
              <Redo2 className="h-4 w-4" />
          </Button>
          
          <Separator orientation="vertical" className="h-4 bg-border/50 mx-1" />

          
           <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onScreenshot}>
              <Camera className="h-4 w-4" />
          </Button>
           <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onMaximize}>
              <Maximize className="h-4 w-4" />
          </Button>
      </div>
    </div>
  );
}
