import { useEffect, useState } from 'react';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { useMarketStore } from '@/stores/trading/market.store';
import { tickBus } from '@/lib/trading/tick-bus';
import { getMarketStream } from '@/lib/sse';
import { isMarketOpenIST } from '@/lib/market-hours';

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
    const { updateAllPositionsPrices } = usePositionsStore();
    const { updateStockPrice, updateLiveCandle } = useMarketStore();
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        const eventSource = getMarketStream();

        if (eventSource.readyState === EventSource.OPEN) {
            setIsConnected(true);
        }

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
                const tradingSymbol = resolveTradingSymbol(quote.symbol);
                if (!tradingSymbol) return;

                if (!isMarketOpenIST()) {
                    // Keep watchlist/chart aligned to historical close outside market hours.
                    return;
                }

                const price = Number(quote.price);
                if (!Number.isFinite(price) || price <= 0) return;

                const tickTime = quote.timestamp
                    ? Math.floor(quote.timestamp / 1000)
                    : Math.floor(Date.now() / 1000);

                tickBus.emitTick({
                    symbol: tradingSymbol,
                    price,
                    volume: quote.volume || 0,
                    timestamp: tickTime,
                    exchange: 'NSE',
                    close: quote.close
                });

                updateAllPositionsPrices({ [tradingSymbol]: price });
                updateStockPrice(tradingSymbol, price, quote.close);
                updateLiveCandle(
                    {
                        price,
                        volume: quote.volume,
                        time: tickTime
                    },
                    tradingSymbol
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

        eventSource.addEventListener('message', handleMessage as EventListener);
        eventSource.addEventListener('open', handleOpen);
        eventSource.addEventListener('error', handleError);

        return () => {
            eventSource.removeEventListener('message', handleMessage as EventListener);
            eventSource.removeEventListener('open', handleOpen);
            eventSource.removeEventListener('error', handleError);
        };
    }, [updateAllPositionsPrices, updateLiveCandle, updateStockPrice]);

    return { isConnected };
};
