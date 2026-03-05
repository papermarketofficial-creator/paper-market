"use client";
import { useEffect } from 'react';
import { useMarketStore } from '@/stores/trading/market.store';
import { useTradeExecutionStore } from '@/stores/trading/tradeExecution.store';

export function TradeEngine() {
    // Select specific state to minimize re-renders
    const livePrice = useMarketStore(s => s.livePrice);
    const simulatedSymbol = useMarketStore(s => s.simulatedSymbol);
    const processTick = useTradeExecutionStore(s => s.processTick);

    // Listen to market ticks
    useEffect(() => {
        if (!livePrice || !simulatedSymbol) return;

        // Pass the tick to execution engine
        processTick(livePrice, simulatedSymbol);

    }, [livePrice, simulatedSymbol, processTick]);

    return null; // Headless
}
