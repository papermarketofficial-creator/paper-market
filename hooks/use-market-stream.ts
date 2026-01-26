
import { useEffect, useRef, useState } from 'react';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { toast } from 'sonner';

export const useMarketStream = () => {
    const { updateAllPositionsPrices, positions } = usePositionsStore();
    const eventSourceRef = useRef<EventSource | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        // Collect symbols to subscribe to
        // For now, we subscribe to everything in our positions list
        // In real app, we might also include Watchlist symbols
        const symbols = positions.map(p => p.symbol);

        if (symbols.length === 0) return;

        // Construct SSE URL with symbols
        // Example: /api/v1/market/stream?symbols=RELIANCE,INFY
        const url = `/api/v1/market/stream?symbols=${symbols.join(',')}`;

        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
            console.log("Market Stream Connected");
            setIsConnected(true);
        };

        eventSource.onmessage = (event) => {
            try {
                // If it's a keep-alive or initial message without JSON
                if (event.data.startsWith(':')) return;

                const message = JSON.parse(event.data);

                if (message.type === 'tick') {
                    const quote = message.data;
                    updateAllPositionsPrices({ [quote.symbol]: quote.price });
                }
            } catch (err) {
                console.error("Failed to parse SSE message", err);
            }
        };

        eventSource.onerror = (err) => {
            console.error("Market Stream Error", err);
            setIsConnected(false);
            eventSource.close();

            // Basic Reconnect logic (EventSource does generic reconnects, but we might want custom backoff)
        };

        return () => {
            console.log("Closing Market Stream");
            eventSource.close();
        };
    }, [positions.length, updateAllPositionsPrices]); // Re-connect if symbol list changes

    return { isConnected };
};
