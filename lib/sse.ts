declare global {
    interface Window {
        __MARKET_STREAM__?: EventSource;
    }
}

/**
 * Get or create the singleton EventSource for market data stream.
 */
export function getMarketStream(): EventSource {
    if (typeof window === "undefined") {
        throw new Error("SSE must run in browser");
    }

    const current = window.__MARKET_STREAM__;
    if (current && current.readyState !== EventSource.CLOSED) {
        return current;
    }

    const eventSource = new EventSource("/api/v1/market/stream");
    window.__MARKET_STREAM__ = eventSource;

    eventSource.onerror = () => {
        if (window.__MARKET_STREAM__ === eventSource && eventSource.readyState === EventSource.CLOSED) {
            window.__MARKET_STREAM__ = undefined;
        }
    };

    return eventSource;
}

/**
 * Close the singleton SSE connection.
 */
export function closeMarketStream() {
    if (typeof window !== "undefined" && window.__MARKET_STREAM__) {
        window.__MARKET_STREAM__.close();
        window.__MARKET_STREAM__ = undefined;
    }
}
