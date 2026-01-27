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
}

export function ChartHeader({ 
    symbol, 
    isInstantOrderActive, 
    onToggleInstantOrder,
    onUndo,
    onRedo,
    onScreenshot,
    onMaximize
}: ChartHeaderProps) {
  const { timeframe, setTimeframe } = useAnalysisStore();

  return (
    <div className="flex items-center justify-between p-1.5 border-b border-border bg-card z-30 shrink-0 h-11">
      {/* Left Section */}
      <div className="flex items-center gap-1.5 h-full">
        {/* Symbol Search Mock */}
        <Button variant="ghost" size="sm" className="h-8 gap-2 px-2 text-foreground font-medium hover:bg-accent hover:text-foreground">
          <Search className="h-4 w-4 text-muted-foreground" />
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

        {/* Timeframe Dropdown (Mocking the W/D/H look) */}
        <div className="flex items-center">
            {['1m', '5m', '15m', '1H', '4H', '1D', '1W'].map((tf) => (
                <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-2 h-7 text-xs font-medium rounded-sm transition-colors ${
                        timeframe === tf
                        ? 'text-blue-500 bg-blue-500/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                >
                    {tf.replace('m', 'm').replace('H', 'h')}
                </button>
            ))}
            <Button variant="ghost" size="icon" className="h-7 w-5 text-muted-foreground">
                <ChevronDown className="h-3 w-3" />
            </Button>
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
