import { useCallback, useEffect, useRef, useState } from 'react';
import { useMarketStore } from '@/stores/trading/market.store';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { getMarketWebSocket } from '@/lib/market-ws';
import { toCanonicalSymbol, toInstrumentKey } from '@/lib/market/symbol-normalization';

const ISIN_LIKE = /^[A-Z]{2}[A-Z0-9]{8,14}$/i;
const CORE_INDEX_KEYS = [
    toInstrumentKey('NSE_INDEX|NIFTY 50'),
    toInstrumentKey('NSE_INDEX|NIFTY BANK'),
    toInstrumentKey('NSE_INDEX|NIFTY FIN SERVICE'),
].filter(Boolean);

function pickFirstFinite(...values: unknown[]): number | null {
    for (const value of values) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

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
    const applyTick = useMarketStore((state) => state.applyTick);
    const hydrateQuotes = useMarketStore((state) => state.hydrateQuotes);
    const updateLiveCandle = useMarketStore((state) => state.updateLiveCandle);
    const stocks = useMarketStore((state) => state.stocks);
    const indices = useMarketStore((state) => state.indices);
    const futures = useMarketStore((state) => state.futures);
    const options = useMarketStore((state) => state.options);
    const simulatedInstrumentKey = useMarketStore((state) => state.simulatedInstrumentKey);
    const simulatedSymbol = useMarketStore((state) => state.simulatedSymbol);
    const positions = usePositionsStore((state) => state.positions);
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef<ReturnType<typeof getMarketWebSocket> | null>(null);
    const subscribedKeysRef = useRef<Set<string>>(new Set());

    const collectDesiredKeys = useCallback((): string[] => {
        const state = useMarketStore.getState();
        const keys = new Set<string>();

        // Collect keys from ALL instrument types (not just stocks and indices)
        const allInstruments = [
            ...(state.stocks || []),
            ...(state.indices || []),
            ...(state.futures || []),
            ...(state.options || []),
        ];

        for (const item of allInstruments) {
            const key = toInstrumentKey(item.instrumentToken || item.symbol || '');
            if (key) keys.add(key);
        }

        // Always include core indices
        for (const key of CORE_INDEX_KEYS) {
            keys.add(key);
        }

        // Include chart instrument
        const chartKey = toInstrumentKey(state.simulatedInstrumentKey || state.simulatedSymbol || '');
        if (chartKey) keys.add(chartKey);

        // Include open position instruments so Current/P&L stay live.
        const openPositions = usePositionsStore.getState().positions || [];
        for (const position of openPositions) {
            const key = toInstrumentKey(position.instrumentToken || position.symbol || '');
            if (key) keys.add(key);
        }

        // Per-user subscription cap: 150 instruments max
        const keysArray = Array.from(keys);
        if (keysArray.length > 150) {
            console.warn(`⚠️  Subscription cap reached: ${keysArray.length} instruments requested, limiting to 150`);
            return keysArray.slice(0, 150);
        }

        return keysArray;
    }, []);

    const syncSubscriptions = useCallback(() => {
        const ws = wsRef.current;
        if (!ws || !ws.isConnected()) return;

        const desired = new Set(collectDesiredKeys());
        const current = subscribedKeysRef.current;

        if (desired.size === current.size && [...desired].every((k) => current.has(k))) {
            return;
        }

        const toSubscribe = Array.from(desired).filter((key) => !current.has(key));
        const toUnsubscribe = Array.from(current).filter((key) => !desired.has(key));

        if (toSubscribe.length > 0) {
            ws.subscribe(toSubscribe);
        }

        if (toUnsubscribe.length > 0) {
            ws.unsubscribe(toUnsubscribe);
        }

        subscribedKeysRef.current = desired;
    }, [collectDesiredKeys]);

    // Re-sync subscriptions when instrument universe OR active chart instrument changes.
    useEffect(() => {
        if (isConnected) {
            syncSubscriptions();
        }
    }, [
        stocks,
        indices,
        futures,
        options,
        positions,
        simulatedInstrumentKey,
        simulatedSymbol,
        isConnected,
        syncSubscriptions,
    ]);

    useEffect(() => {
        let cancelled = false;

        const handleTick = (tickData: any) => {
            if (process.env.NODE_ENV === 'development') {
                console.log('RAW TICK:', tickData);
            }

            const rawInstrument =
                tickData?.instrumentKey ??
                tickData?.instrument_key ??
                tickData?.instrumentToken ??
                tickData?.instrument_token ??
                tickData?.symbol;

            const instrumentKey = toInstrumentKey(String(rawInstrument || ''));
            if (!instrumentKey) return;

            const tradingSymbol =
                toCanonicalSymbol(tickData?.symbol) ||
                instrumentKey.split('|')[1] ||
                instrumentKey;

            const safeSymbol =
                tradingSymbol ||
                instrumentKey.split('|')[1] ||
                instrumentKey;

            const price =
                Number(tickData?.price) ||
                Number(tickData?.ltp) ||
                Number(tickData?.last_price) ||
                Number(tickData?.lastTradedPrice) ||
                Number(tickData?.lastPrice) ||
                Number(tickData?.ltpc?.ltp) ||
                Number(tickData?.data?.price) ||
                Number(tickData?.data?.ltp);

            if (!Number.isFinite(price)) {
                console.warn('Dropping tick - invalid price', tickData);
                return;
            }

            const close = pickFirstFinite(
                tickData?.close,
                tickData?.cp,
                tickData?.prevClose,
                tickData?.prev_close,
                tickData?.ltpc?.cp,
                tickData?.data?.close
            );

            const timestamp = pickFirstFinite(
                tickData?.timestamp,
                tickData?.ts,
                tickData?.time,
                tickData?.ltt,
                tickData?.ltpc?.ltt,
                tickData?.data?.timestamp
            );

            if (process.env.NODE_ENV === 'development') {
                console.log('PARSED TICK:', {
                    instrumentKey,
                    tradingSymbol: safeSymbol,
                    price,
                });
            }

            applyTick({
                instrumentKey,
                symbol: safeSymbol,
                price,
                close: close && close > 0 ? close : undefined,
                timestamp: timestamp && timestamp > 0 ? timestamp : undefined,
            });
        };

        const handleCandle = (candleData: any) => {
            // ═══════════════════════════════════════════════════════════
            // 📊 HANDLE CANDLE FROM MARKET-ENGINE
            // ═══════════════════════════════════════════════════════════
            const { candle, instrumentKey: rawInstrumentKey, symbol: rawSymbol } = candleData;

            const instrumentKey = toInstrumentKey(rawInstrumentKey);
            const tradingSymbol = toCanonicalSymbol(resolveTradingSymbol(rawSymbol || rawInstrumentKey));

            if (!instrumentKey || !tradingSymbol) return;

            // updateLiveCandle expects { price, volume, time }
            updateLiveCandle(
                {
                    price: candle.close,
                    volume: candle.volume || 0,
                    time: candle.time
                },
                tradingSymbol,
                instrumentKey
            );
        };

        const connect = async () => {
            // ═══════════════════════════════════════════════════════════
            // 🔄 STEP 1: Hydrate initial snapshot
            // ═══════════════════════════════════════════════════════════
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

            // ═══════════════════════════════════════════════════════════
            // 🔌 STEP 2: Connect to market-engine WebSocket
            // ═══════════════════════════════════════════════════════════
            const wsUrl = process.env.NEXT_PUBLIC_MARKET_ENGINE_WS_URL || 'ws://localhost:4200';

            const ws = getMarketWebSocket({
                url: wsUrl,
                onTick: handleTick,
                onCandle: handleCandle,
                onConnected: () => {
                    setIsConnected(true);
                    syncSubscriptions();
                },
                onDisconnected: () => {
                    setIsConnected(false);
                    subscribedKeysRef.current = new Set();
                },
                onError: () => {
                    setIsConnected(false);
                    subscribedKeysRef.current = new Set();
                }
            });
            wsRef.current = ws;

            ws.connect();
        };

        connect();

        return () => {
            cancelled = true;
            const ws = wsRef.current;
            if (ws?.isConnected() && subscribedKeysRef.current.size > 0) {
                ws.unsubscribe(Array.from(subscribedKeysRef.current));
            }
            subscribedKeysRef.current = new Set();
            // Note: We don't disconnect the WebSocket here as it's a singleton
            // It will be reused across component mounts
        };
    }, [applyTick, hydrateQuotes, syncSubscriptions, updateLiveCandle]);

    return { isConnected };
};
