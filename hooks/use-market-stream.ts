import { useEffect, useState } from 'react';
import { useMarketStore } from '@/stores/trading/market.store';
import { tickBus } from '@/lib/trading/tick-bus';
import { getMarketStream } from '@/lib/sse';
import { toCanonicalSymbol, toInstrumentKey } from '@/lib/market/symbol-normalization';

const ISIN_LIKE = /^[A-Z]{2}[A-Z0-9]{8,14}$/i;

function resolveTradingSymbol(rawSymbol: unknown): string {
    if (typeof rawSymbol !== 'string') return '';

    const input = rawSymbol.trim();
    if (!input) return '';

    // Common case: already tradingsymbol (e.g. "ITC")
    if (!input.includes('|') && !ISIN_LIKE.test(input)) {
        return input;
    }

    const symbolPart = input.includes('|') ? (input.split('|')[1] || input) : input;

    // Some feeds send NSE_EQ|ITC. Use direct symbol if RHS is not ISIN-like.
    if (!ISIN_LIKE.test(symbolPart) && symbolPart) {
        return symbolPart;
    }

    // Fallback: resolve from currently loaded instruments/watchlist.
    const state = useMarketStore.getState();
    const all = [...state.stocks, ...state.indices, ...state.futures, ...state.options];
    const match = all.find((item) =>
        item.instrumentToken === input ||
        item.instrumentToken === symbolPart ||
        item.instrumentToken?.endsWith(`|${symbolPart}`)
    );

    return match?.symbol || symbolPart || input;
}

export const useMarketStream = () => {
    const { applyTick, hydrateQuotes, updateLiveCandle } = useMarketStore();
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        let eventSource: EventSource | null = null;
        let cancelled = false;

        const handleMessage = (event: MessageEvent) => {
            try {
                if (typeof event.data !== 'string' || event.data.length === 0) return;
                if (event.data[0] !== '{') return;

                const message = JSON.parse(event.data);

                if (message.type === 'connected') {
                    setIsConnected(true);
                    return;
                }

                if (message.type !== 'tick' || !message.data) {
                    return;
                }

                const quote = message.data;
                const instrumentKey = toInstrumentKey(
                    quote.instrumentKey || quote.instrument_key || quote.symbol
                );
                const tradingSymbol = toCanonicalSymbol(
                    resolveTradingSymbol(quote.symbol || quote.instrumentKey || quote.instrument_key)
                );
                if (!instrumentKey) return;
                if (!tradingSymbol) return;

                const price = Number(quote.price);
                if (!Number.isFinite(price) || price <= 0) return;

                const tickTime = quote.timestamp
                    ? Math.floor(quote.timestamp / 1000)
                    : Math.floor(Date.now() / 1000);

                tickBus.emitTick({
                    instrumentKey,
                    symbol: tradingSymbol,
                    price,
                    volume: quote.volume || 0,
                    timestamp: tickTime,
                    exchange: 'NSE',
                    close: quote.close
                });

                applyTick({
                    instrumentKey,
                    symbol: tradingSymbol,
                    price,
                    close: quote.close,
                    timestamp: quote.timestamp,
                });
                updateLiveCandle(
                    {
                        price,
                        volume: quote.volume,
                        time: tickTime
                    },
                    tradingSymbol,
                    instrumentKey
                );
            } catch (err) {
                console.error('Failed to parse SSE message', err);
            }
        };

        const handleOpen = () => {
            setIsConnected(true);
        };

        const handleError = () => {
            setIsConnected(false);
        };

        const connect = async () => {
            try {
                const snapshotRes = await fetch('/api/v1/market/snapshot', {
                    cache: 'no-store',
                });
                if (snapshotRes.ok) {
                    const snapshot = await snapshotRes.json();
                    if (snapshot?.success && Array.isArray(snapshot?.data?.quotes) && snapshot.data.quotes.length > 0) {
                        hydrateQuotes(snapshot.data.quotes);
                    }
                }
            } catch {
                // Best effort hydration only.
            }

            if (cancelled) return;

            eventSource = getMarketStream();
            if (eventSource.readyState === EventSource.OPEN) {
                setIsConnected(true);
            }

            eventSource.addEventListener('message', handleMessage as EventListener);
            eventSource.addEventListener('open', handleOpen);
            eventSource.addEventListener('error', handleError);
        };

        connect();

        return () => {
            cancelled = true;
            if (!eventSource) return;
            eventSource.removeEventListener('message', handleMessage as EventListener);
            eventSource.removeEventListener('open', handleOpen);
            eventSource.removeEventListener('error', handleError);
        };
    }, [applyTick, hydrateQuotes, updateLiveCandle]);

    return { isConnected };
};
