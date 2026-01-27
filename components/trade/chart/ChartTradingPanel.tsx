"use client";

import { useMarketStore } from '@/stores/trading/market.store';
import { ChevronDown, ChevronsDown, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState, useEffect } from 'react';

interface ChartTradingPanelProps {
  symbol: string;
}

export function ChartTradingPanel({ symbol }: ChartTradingPanelProps) {
  const { historicalData, livePrice } = useMarketStore();
  const [qty, setQty] = useState(1);
  const [isExpanded, setIsExpanded] = useState(true);

  // Mock OHLC or get from last candle
  const lastCandle = historicalData.length > 0 ? historicalData[historicalData.length - 1] : null;
  
  // Format helpers
  const fmt = (n?: number) => n?.toFixed(2) || '0.00';
  const fmtVol = (n?: number) => n ? (n / 1000000).toFixed(2) + 'M' : '0';

  const change = lastCandle ? (lastCandle.close - lastCandle.open) : 0;
  const changePct = lastCandle ? ((change / lastCandle.open) * 100) : 0;
  const colorClass = change >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]';

  return (
    <div className="absolute top-3 left-3 z-30 flex flex-col gap-1 min-w-[340px]">
        {/* Data Strip (Top) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-muted-foreground/80 bg-background/40 backdrop-blur-[1px] px-2 py-0.5 rounded-sm select-none pointer-events-none">
            <div className="flex items-center gap-1 font-bold text-foreground">
                {symbol} <span className="w-1 h-1 rounded-full bg-foreground mx-0.5"></span> 1W <span className="w-1 h-1 rounded-full bg-foreground mx-0.5"></span> NSE
            </div>
            {lastCandle && (
                <>
                <span className={colorClass}>●</span>
                <span>O<span className={colorClass}>{fmt(lastCandle.open)}</span></span>
                <span>H<span className={colorClass}>{fmt(lastCandle.high)}</span></span>
                <span>L<span className={colorClass}>{fmt(lastCandle.low)}</span></span>
                <span>C<span className={colorClass}>{fmt(lastCandle.close)}</span></span>
                <span className={colorClass}>{change > 0 ? '+' : ''}{fmt(change)} ({fmt(changePct)}%)</span>
                <span>Vol<span className="text-yellow-500">{fmtVol(20530400)}</span></span>
                </>
            )}
        </div>

        {/* Trading Box */}
        <div className="flex items-center bg-card border border-border rounded-sm shadow-lg overflow-hidden w-fit mt-1">
             {/* Sell Button */}
            <button 
                className="flex flex-col items-center justify-center h-10 w-24 bg-[#EF4444] hover:bg-[#DC2626] text-white transition-colors border-r border-black/20"
                onClick={() => (window as any).triggerTrade?.('SELL')}
            >
                <div className="text-[10px] font-bold uppercase opacity-80 mb-[-2px]">Sell</div>
                <div className="text-xs font-bold">{fmt(livePrice - 0.10)}</div>
            </button>

            {/* Qty Input */}
            <div className="flex flex-col items-center justify-center p-1 bg-background h-10 w-16 relative">
                 <div className="text-[8px] uppercase text-muted-foreground font-bold absolute top-1 left-0 w-full text-center">Qty</div>
                 <input 
                    type="number"
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value))}
                    className="w-full h-full bg-transparent text-center text-sm font-bold text-foreground focus:outline-none pt-2" 
                 />
            </div>

             {/* Buy Button */}
             <button 
                className="flex flex-col items-center justify-center h-10 w-24 bg-[#22C55E] hover:bg-[#16A34A] text-white transition-colors border-l border-black/20"
                onClick={() => (window as any).triggerTrade?.('BUY')}
            >
                <div className="text-[10px] font-bold uppercase opacity-80 mb-[-2px]">Buy</div>
                <div className="text-xs font-bold">{fmt(livePrice)}</div>
            </button>

             {/* Expand/Collapse Toggle (Visual only for now) */}
             <div className="h-10 w-6 flex items-center justify-center bg-card border-l border-border hover:bg-accent cursor-pointer">
                 <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </div>
        </div>
    </div>
  );
}
