
import { useEffect, useRef, useState } from 'react';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { useMarketStore } from '@/stores/trading/market.store';
import { toast } from 'sonner';
import { tickBus } from '@/lib/trading/tick-bus';

// ═══════════════════════════════════════════════════════════
// 🛠️ GLOBAL CONNECTION FLAG: Prevent React Strict Mode duplicates
// ═══════════════════════════════════════════════════════════
let globalEventSource: EventSource | null = null;
let isConnecting = false;

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

        // ═══════════════════════════════════════════════════════════
        // 🛠️ GUARD: Prevent duplicate connections (React Strict Mode)
        // ═══════════════════════════════════════════════════════════
        if (globalEventSource || isConnecting) {
            console.log('⚠️ SSE: Already connected or connecting, skipping duplicate');
            eventSourceRef.current = globalEventSource;
            return;
        }

        isConnecting = true;
        isConnecting = true;

        // Construct SSE URL with symbols
        const url = `/api/v1/market/stream?symbols=${allSymbols.join(',')}`;
        console.log('📡 SSE: Connecting to', url, 'Symbols:', allSymbols);

        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;
        globalEventSource = eventSource;
        
        // ... (rest of the effect logic is same, just need to close correctly)
        eventSource.onopen = () => {
             console.log("✅ Market Stream Connected - SSE is LIVE");
             setIsConnected(true);
             isConnecting = false; // Reset flag on successful connection
        };

        eventSource.onmessage = (event) => {
             // ... existing message handler ...
             console.log('📨 RAW SSE Event:', event.data); // Debug log
             try {
                if (event.data.startsWith(':')) return;
                const message = JSON.parse(event.data);
                console.log('📦 Parsed SSE Message:', message); // Debug log
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

                    // ═══════════════════════════════════════════════════════════
                    // 🚌 HIGH-PERFORMANCE PATH: Emit to Client TickBus
                    // ═══════════════════════════════════════════════════════════
                    // This feeds: TickBus → CandleEngine → ChartController (RAF batching @ 60 FPS)
                    tickBus.emitTick({
                        symbol: tradingSymbol,
                        price: quote.price,
                        volume: quote.volume || 0,
                        timestamp: quote.timestamp ? Math.floor(quote.timestamp / 1000) : Math.floor(Date.now() / 1000),
                        exchange: 'NSE',
                        close: quote.close
                    });

                    // ═══════════════════════════════════════════════════════════
                    // 📊 LEGACY PATH: Update stores for watchlist/positions
                    // ═══════════════════════════════════════════════════════════
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
            console.log("🔴 Cleanup called - checking if should close");
            console.trace("Cleanup stack trace"); // See what's triggering cleanup
            
            // Only close if this effect instance created the connection
            if (eventSourceRef.current && eventSourceRef.current === globalEventSource) {
                console.log("🔴 Closing Market Stream (this instance owns it)");
                eventSourceRef.current.close();
                globalEventSource = null;
            } else {
                console.log("⚠️ Cleanup skipped - connection owned by another instance");
            }
            
            eventSourceRef.current = null;
            isConnecting = false;
        };
    }, [
        positionSymbolsStr, 
        watchlistSymbolsStr, 
        simulatedSymbol
        // ❌ REMOVED: updateAllPositionsPrices, updateStockPrice
        // These are Zustand store functions - they're stable and don't need to be in deps
        // Including them causes the effect to re-run on every render!
    ]);

    return { isConnected };
};
