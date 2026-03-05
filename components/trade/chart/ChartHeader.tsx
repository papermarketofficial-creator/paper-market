"use client";

import { ChartStyle, useAnalysisStore } from '@/stores/trading/analysis.store';
import { IndicatorsMenu } from './IndicatorsMenu';
import { Button } from '@/components/ui/button';
import { 
  Search, 
  Camera, 
  Maximize, 
  Minimize2,
  Undo2,
  Redo2,
  CandlestickChart
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChartHeaderProps {
  symbol: string;
  displaySymbol?: string;
  chartStyle?: ChartStyle;
  compact?: boolean;
  isInstantOrderActive: boolean;
  onToggleInstantOrder: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onScreenshot?: () => void;
  onMaximize?: () => void;
  onSearchClick?: () => void;
  onChartStyleChange?: (style: ChartStyle) => void;
  isLoading?: boolean;
  isFullscreen?: boolean;
}

export function ChartHeader({ 
    symbol, 
    displaySymbol,
    chartStyle = "CANDLE",
    compact = false,
    isInstantOrderActive, 
    onToggleInstantOrder,
    onUndo,
    onRedo,
    onScreenshot,
    onMaximize,
    onSearchClick,
    onChartStyleChange,
    isLoading = false,
    isFullscreen = false
}: ChartHeaderProps) {
  const { range, setRange } = useAnalysisStore();
  const headerText = displaySymbol || symbol;

  const ranges = ['5Y', '1Y', '6M', '3M', '1M', '5D', '1D'];
  const styleLabels = {
    CANDLE: "Candles",
    LINE: "Line",
    AREA: "Area",
    HEIKIN_ASHI: "Heikin Ashi",
  } as const;

  return (
    <div
      className={cn(
        "z-30 shrink-0 border-b border-border bg-card p-1.5 flex items-center justify-between gap-2",
        compact ? "h-auto" : "h-11 md:h-11",
      )}
    >
      {/* Scrollable Container for Mobile, standard for Desktop */}
      <div className="flex h-full items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden w-full md:w-auto">
        {/* Symbol Search Trigger */}
        <Button 
          variant="ghost" 
          size="sm" 
          disabled={isLoading}
          className="h-8 gap-1.5 px-2 text-foreground font-medium hover:bg-accent hover:text-foreground disabled:opacity-70 shrink-0"
          onClick={onSearchClick}
        >
          {isLoading ? (
             <div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          ) : (
             <Search className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="uppercase text-[11px] md:text-sm">{headerText}</span>
          <span className="hidden md:inline-block text-[10px] text-muted-foreground bg-muted px-1 rounded-sm border border-border">NSE</span>
        </Button>

        <Separator orientation="vertical" className="h-4 bg-border/50 mx-0.5 shrink-0" />

        {/* Buy/Sell Buttons - Now using Tailwind hidden for mobile */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
            <Button 
                size="sm" 
                className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-600/90 text-white text-[10px] font-bold uppercase transition-transform active:scale-95"
                onClick={() => (window as any).triggerTrade?.('BUY')}
            >
                Buy
            </Button>
            <Button 
                size="sm" 
                className="h-7 px-2.5 bg-rose-600 hover:bg-rose-600/90 text-white text-[10px] font-bold uppercase transition-transform active:scale-95"
                onClick={() => (window as any).triggerTrade?.('SELL')}
            >
                Sell
            </Button>
        </div>

        <Separator orientation="vertical" className="hidden md:block h-4 bg-border/50 mx-0.5 shrink-0" />

        {/* Range Selector (Mobile Dropdown) */}
        <div className="md:hidden flex items-center shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[10px] text-muted-foreground hover:text-foreground">
                <span>{range}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[120px] grid grid-cols-2 gap-1 p-2">
              {ranges.map((r) => (
                <DropdownMenuItem
                  key={r}
                  onClick={() => setRange(r)}
                  className={`text-xs justify-center flex cursor-pointer ${range === r ? "bg-accent font-medium text-[#2d6cff]" : ""}`}
                >
                  {r}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Range Selector (Desktop Inline list) */}
        <div className="hidden md:flex items-center shrink-0">
            {ranges.map((r) => (
                <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-2 h-7 text-xs font-semibold rounded-sm transition-colors uppercase ${
                        range === r
                        ? 'text-[#2d6cff] bg-[#2d6cff]/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                >
                    {r}
                </button>
            ))}
        </div>

        <Separator orientation="vertical" className="h-4 bg-border/50 mx-0.5 shrink-0" />

        {/* Chart Style (Visible on both) */}
        <div className="flex items-center shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[10px] md:text-xs text-muted-foreground hover:text-foreground transition-none">
                <CandlestickChart className="h-3.5 w-3.5 md:h-4 md:w-4" />
                <span className="hidden sm:inline-block">{styleLabels[chartStyle]}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {(["CANDLE", "LINE", "AREA", "HEIKIN_ASHI"] as const).map((style) => (
                <DropdownMenuItem
                  key={style}
                  onClick={() => onChartStyleChange?.(style)}
                  className={chartStyle === style ? "bg-accent font-medium" : ""}
                >
                  {styleLabels[style]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Indicators */}
          <IndicatorsMenu symbol={symbol} />
        </div>
      </div>

      {/* Right Section - Desktop Only Settings */}
      <div className="hidden md:flex items-center gap-1 shrink-0 ml-auto">
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
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
      </div>
    </div>
  );
}
