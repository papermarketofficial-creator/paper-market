
import { useEffect, useRef, useState } from 'react';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { useMarketStore } from '@/stores/trading/market.store';
import { toast } from 'sonner';

export const useMarketStream = () => {
    const { updateAllPositionsPrices, positions } = usePositionsStore();
    const { stocks, updateStockPrice } = useMarketStore();
    const eventSourceRef = useRef<EventSource | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const positionSymbolsStr = positions.map(p => p.symbol).sort().join(',');
    const watchlistSymbolsStr = stocks.map(s => s.symbol).sort().join(',');
    const simulatedSymbol = useMarketStore.getState().simulatedSymbol;

    useEffect(() => {
        // ... previous logic using internal values ...
        // Note: inside useEffect we should re-derive valid symbols if needed
        // But here we rely on the effect re-running when the strings change.
        
        const { simulatedSymbol: currentSimulatedSymbol, instruments: allInstruments } = useMarketStore.getState();

        // Collect symbols to subscribe to:
        const positionSymbols = positions.map(p => p.symbol);
        const watchlistSymbols = stocks.map(s => s.symbol);
        const activeSymbol = currentSimulatedSymbol ? [currentSimulatedSymbol] : [];
        
        const allSymbols = [...new Set([...positionSymbols, ...watchlistSymbols, ...activeSymbol])];

        if (allSymbols.length === 0) {
            console.log('⚠️ SSE: No symbols to subscribe to');
            return;
        }

        // Construct SSE URL with symbols
        const url = `/api/v1/market/stream?symbols=${allSymbols.join(',')}`;
        console.log('📡 SSE: Connecting to', url, 'Symbols:', allSymbols);

        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;
        
        // ... (rest of the effect logic is same, just need to close correctly)
        eventSource.onopen = () => {
             console.log("✅ Market Stream Connected - SSE is LIVE");
             setIsConnected(true);
        };

        eventSource.onmessage = (event) => {
             // ... existing message handler ...
             try {
                if (event.data.startsWith(':')) return;
                const message = JSON.parse(event.data);
                if (message.type === 'connected') return;

                if (message.type === 'tick') {
                    const quote = message.data;
                    console.log('📊 SSE Tick Received:', quote.symbol, quote.price);
                    
                    let tradingSymbol = quote.symbol;

                    const matchedInstrument = allInstruments.find(i => 
                        i.instrumentToken === quote.symbol || 
                        i.instrumentToken?.includes(quote.symbol)
                    );

                    if (matchedInstrument) {
                        tradingSymbol = matchedInstrument.tradingsymbol;
                    }

                    updateAllPositionsPrices({ [tradingSymbol]: quote.price });
                    updateStockPrice(tradingSymbol, quote.price, quote.close);
                    
                    const { updateLiveCandle } = useMarketStore.getState();
                    // Use actual tick timestamp (in milliseconds) from Upstox, convert to seconds
                    const tickTime = quote.timestamp ? Math.floor(quote.timestamp / 1000) : Math.floor(Date.now() / 1000);
                    console.log('📈 Updating live candle for:', tradingSymbol, 'Price:', quote.price, 'Time:', tickTime);
                    updateLiveCandle({
                        price: quote.price,
                        volume: quote.volume,
                        time: tickTime
                    }, tradingSymbol);
                }
            } catch (err) {
                console.error("Failed to parse SSE message", err);
            }
        };

        eventSource.onerror = (err) => {
            console.error("❌ Market Stream Error", err);
            setIsConnected(false);
            eventSource.close();
        };

        return () => {
            console.log("🔴 Closing Market Stream");
            eventSource.close();
        };
    }, [
        positionSymbolsStr, 
        watchlistSymbolsStr, 
        simulatedSymbol, 
        updateAllPositionsPrices, 
        updateStockPrice 
    ]);

    return { isConnected };
};
