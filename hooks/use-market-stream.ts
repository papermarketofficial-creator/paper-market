
import { useEffect, useRef, useState } from 'react';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { useMarketStore } from '@/stores/trading/market.store';
import { tickBus } from '@/lib/trading/tick-bus';
import { getMarketStream } from '@/lib/sse'; // Import Singleton

export const useMarketStream = () => {
    const { updateAllPositionsPrices } = usePositionsStore();
    const { updateStockPrice, instruments: allInstruments, updateLiveCandle } = useMarketStore();
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        // ═══════════════════════════════════════════════════════════
        // 📡 TRANSPORT LAYER: Singleton Connection
        // ═══════════════════════════════════════════════════════════
        // We ask the singleton for the active stream.
        // We do NOT create a new one every time.
        const eventSource = getMarketStream();
        
        // Update local state based on current readiness
        if (eventSource.readyState === 1) {
            setIsConnected(true);
        }

        // ═══════════════════════════════════════════════════════════
        // 📨 MESSAGE HANDLING
        // ═══════════════════════════════════════════════════════════
        // We attach our listener to the singleton.
        // NOTE: If multiple components use this, they sort of fight for onmessage.
        // ideally use addEventListener, but for now we follow the pattern.
        
        eventSource.onmessage = (event) => {
             // console.log('📨 RAW SSE Event:', event.data); 
             try {
                if (event.data.startsWith(':')) return; // Heartbeat/Ping
                const message = JSON.parse(event.data);
                
                if (message.type === 'connected') {
                    setIsConnected(true);
                    return;
                }

                if (message.type === 'tick') {
                    const quote = message.data;
                    // console.log('📊 SSE Tick:', quote.symbol, quote.price);
                    
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
                    // These are fast Zustand updates
                    updateAllPositionsPrices({ [tradingSymbol]: quote.price });
                    updateStockPrice(tradingSymbol, quote.price, quote.close);
                    
                    // Update candle (if relevant)
                    const tickTime = quote.timestamp ? Math.floor(quote.timestamp / 1000) : Math.floor(Date.now() / 1000);
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

        eventSource.onopen = () => {
             console.log("✅ Market Stream Connected (Hook)");
             setIsConnected(true);
        };

        eventSource.onerror = (err) => {
            console.error("❌ Market Stream Error (Hook view)", err);
            // Don't close, let singleton/browser retry
            setIsConnected(false);
        };

        // ═══════════════════════════════════════════════════════════
        // 🧹 CLEANUP: Do NOT close connection
        // ═══════════════════════════════════════════════════════════
        return () => {
            console.log("🧘 Hook unmounting - detaching listeners but KEEPING connection");
            // We ideally should remove listeners if we used addEventListener.
            // With onmessage, setting it to null stops updates for this hook instance.
            // eventSource.onmessage = null; 
            // BUT: If other components rely on this singleton, clearing it kills their updates too.
            // Since we assume this hook is used once (Layout), this is acceptable.
            // If moved to provider, this logic changes slightly.
            
            // For now, we leave it or clear it?
            // "Singleton owns lifecycle"
            // If we clear onmessage, we stop processing ticks. 
            // If we navigate away, we probably WANT to stop processing ticks to save CPU.
            // So:
            eventSource.onmessage = null; 
        };
    }, []); // ✅ FIX: No dependencies = Connect ONCE

    return { isConnected };
};
