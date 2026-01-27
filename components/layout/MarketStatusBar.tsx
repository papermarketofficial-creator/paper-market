"use client";

import { useEffect } from 'react';
import { useGlobalStore } from '@/stores/global.store';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export function MarketStatusBar() {
    const { isMarketOpen, indices, selectedSymbol, setIndices } = useGlobalStore();

    // Simulate subtle price movements
    useEffect(() => {
        const interval = setInterval(() => {
            setIndices({
                NIFTY: indices.NIFTY + (Math.random() - 0.5) * 10,
                BANKNIFTY: indices.BANKNIFTY + (Math.random() - 0.5) * 20,
            });
        }, 2000);
        return () => clearInterval(interval);
    }, [indices, isMarketOpen, setIndices]);

    return (
        <div className="h-8 bg-card/60 backdrop-blur-md border-b border-white/5 flex items-center px-4 justify-between text-xs overflow-hidden">
            {/* Left: Market Status Pulse */}
            <div className="flex items-center gap-4">

                {/* Indices Ticker */}
                <div className="flex items-center gap-4 text-muted-foreground font-mono">
                    <div className="flex items-center gap-1">
                        <span className={cn("font-bold", selectedSymbol === "NIFTY" && "text-primary")}>NIFTY</span>
                        <span className="text-foreground">{indices.NIFTY.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className={cn("font-bold", selectedSymbol === "BANKNIFTY" && "text-primary")}>BANKNIFTY</span>
                        <span className="text-foreground">{indices.BANKNIFTY.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span>SENSEX</span>
                        <span className="text-foreground">{indices.SENSEX.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Right: Global Context Indicator */}
            <div className="flex items-center gap-2">
                <span className="text-muted-foreground mr-1">Workspace Priority:</span>
                <Badge variant="secondary" className="text-[10px] h-5">
                    {selectedSymbol}
                </Badge>
            </div>
        </div>
    );
}
