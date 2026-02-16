import WebSocket, { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { jwtVerify } from 'jose';
import { tickBus } from '../core/tick-bus.js';
import { candleEngine } from '../core/candle-engine.js';
import { marketFeedSupervisor } from '../core/market-feed-supervisor.js';
import { logger } from '../lib/logger.js';
import { toInstrumentKey } from '../core/symbol-normalization.js';
import type { NormalizedTick, CandleUpdate } from '../core/types.js';

// ═══════════════════════════════════════════════════════════
// 📡 WEBSOCKET SERVER: Broadcast ticks and candles to clients
// ═══════════════════════════════════════════════════════════

interface ClientSubscription {
    ws: WebSocket;
    symbols: Set<string>;
    userId: string | null;
    connectedAt: number;
}

// Global subscription tracking (ref-counted across clients)
const globalSubscriptions = new Map<string, number>(); // symbol → ref count
const symbolSubscribers = new Map<string, Set<ClientSubscription>>();
const clients = new Set<ClientSubscription>();
const droppingSockets = new WeakSet<WebSocket>();

let droppedSlowClients = 0;
let rejectedMessages = 0;

const MAX_SYMBOLS_PER_CLIENT = Number(process.env.WS_MAX_SYMBOLS_PER_CLIENT ?? 100);
const MAX_BUFFERED_BYTES = Number(process.env.WS_MAX_BUFFERED_BYTES ?? 1_000_000);
const MAX_MESSAGE_SIZE_BYTES = Number(process.env.WS_MAX_MESSAGE_SIZE_BYTES ?? 8192);
const WS_AUTH_REQUIRED = process.env.WS_AUTH_REQUIRED === 'true';
const WS_JWT_SECRET = process.env.ENGINE_WS_JWT_SECRET || process.env.AUTH_SECRET || '';
const HEARTBEAT_INTERVAL_MS = 20_000;
const METRICS_INTERVAL_MS = 30_000;
const POLICY_VIOLATION = 1008;

const jwtSecretBytes = WS_JWT_SECRET ? new TextEncoder().encode(WS_JWT_SECRET) : null;

function normalizeSymbols(input: unknown): string[] {
    if (!Array.isArray(input)) return [];

    const unique = new Set<string>();
    for (const raw of input) {
        if (typeof raw !== 'string') continue;
        const normalized = toInstrumentKey(raw);
        if (!normalized) continue;
        unique.add(normalized);
    }

    return Array.from(unique);
}

function messageSizeBytes(message: WebSocket.RawData): number {
    if (typeof message === 'string') return Buffer.byteLength(message);
    if (Buffer.isBuffer(message)) return message.length;
    if (Array.isArray(message)) return message.reduce((sum, chunk) => sum + chunk.length, 0);
    return message.byteLength;
}

function extractToken(request: IncomingMessage): string | null {
    try {
        const base = `ws://${request.headers.host || 'localhost'}`;
        const parsed = new URL(request.url || '/', base);
        const token = parsed.searchParams.get('token');
        return token && token.trim().length > 0 ? token.trim() : null;
    } catch {
        return null;
    }
}

async function verifyTokenUserId(token: string): Promise<string | null> {
    if (!jwtSecretBytes) return null;

    try {
        const { payload } = await jwtVerify(token, jwtSecretBytes);
        const userId = payload.sub || (typeof payload.userId === 'string' ? payload.userId : null);
        return userId && userId.trim().length > 0 ? userId : null;
    } catch {
        return null;
    }
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
        ws.send(JSON.stringify(payload));
    } catch (error) {
        logger.warn({ err: error }, 'Failed to send websocket control message');
    }
}

function safeSend(client: ClientSubscription, payload: string): void {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    if (client.ws.bufferedAmount > MAX_BUFFERED_BYTES) {
        if (!droppingSockets.has(client.ws)) {
            droppingSockets.add(client.ws);
            droppedSlowClients++;
            logger.warn(
                { userId: client.userId, bufferedAmount: client.ws.bufferedAmount },
                'Dropping slow websocket client'
            );
            client.ws.terminate();
        }
        return;
    }

    try {
        client.ws.send(payload);
    } catch (error) {
        logger.warn({ err: error, userId: client.userId }, 'Failed to send websocket payload');
    }
}

function addSymbolSubscriber(symbol: string, client: ClientSubscription): void {
    let subscribers = symbolSubscribers.get(symbol);
    if (!subscribers) {
        subscribers = new Set<ClientSubscription>();
        symbolSubscribers.set(symbol, subscribers);
    }
    subscribers.add(client);
}

function removeSymbolSubscriber(symbol: string, client: ClientSubscription): void {
    const subscribers = symbolSubscribers.get(symbol);
    if (!subscribers) return;

    subscribers.delete(client);
    if (subscribers.size === 0) {
        symbolSubscribers.delete(symbol);
    }
}

function totalSubscriptionCount(): number {
    let total = 0;
    for (const count of globalSubscriptions.values()) {
        total += count;
    }
    return total;
}

export function createWebSocketServer(port: number): WebSocketServer {
    const wss = new WebSocketServer({ port, maxPayload: MAX_MESSAGE_SIZE_BYTES });

    logger.info({ port }, 'WebSocket server starting');

    wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
        void onConnection(ws, request);
    });

    // ═══════════════════════════════════════════════════════════
    // 🎯 WIRE TICK BROADCASTING
    // ═══════════════════════════════════════════════════════════
    const tickHandler = (tick: NormalizedTick) => {
        const subscribers = symbolSubscribers.get(toInstrumentKey(tick.instrumentKey));
        if (!subscribers || subscribers.size === 0) return;

        const message = JSON.stringify({
            type: 'tick',
            data: {
                instrumentKey: tick.instrumentKey,
                symbol: tick.symbol,
                price: tick.price,
                timestamp: tick.timestamp * 1000, // Convert to milliseconds for clients
                volume: tick.volume,
                close: tick.close
            }
        });

        for (const client of subscribers) {
            safeSend(client, message);
        }
    };
    tickBus.on('tick', tickHandler);

    // ═══════════════════════════════════════════════════════════
    // 📊 WIRE CANDLE BROADCASTING
    // ═══════════════════════════════════════════════════════════
    const candleHandler = (update: CandleUpdate) => {
        const subscribers = symbolSubscribers.get(toInstrumentKey(update.instrumentKey));
        if (!subscribers || subscribers.size === 0) return;

        const message = JSON.stringify({
            type: 'candle',
            data: {
                type: update.type,
                candle: update.candle,
                instrumentKey: update.instrumentKey,
                symbol: update.symbol,
                interval: update.interval
            }
        });

        for (const client of subscribers) {
            safeSend(client, message);
        }
    };
    candleEngine.on('candle', candleHandler);

    // ═══════════════════════════════════════════════════════════
    // 💓 HEARTBEAT
    // ═══════════════════════════════════════════════════════════
    const heartbeatInterval = setInterval(() => {
        const heartbeat = JSON.stringify({ type: 'heartbeat' });
        clients.forEach(client => {
            safeSend(client, heartbeat);
        });
    }, HEARTBEAT_INTERVAL_MS);

    const metricsInterval = setInterval(() => {
        logger.info(
            {
                connectedClients: clients.size,
                activeSymbols: symbolSubscribers.size,
                totalSubscriptions: totalSubscriptionCount(),
                subscriptionsPerSymbol: Object.fromEntries(globalSubscriptions),
                droppedSlowClients,
                rejectedMessages
            },
            'WebSocket fanout metrics'
        );
    }, METRICS_INTERVAL_MS);

    wss.on('close', () => {
        clearInterval(heartbeatInterval);
        clearInterval(metricsInterval);
        tickBus.off('tick', tickHandler);
        candleEngine.off('candle', candleHandler);
    });

    return wss;
}

// ═══════════════════════════════════════════════════════════
// 📝 SUBSCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════

async function onConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    const token = extractToken(request);
    const authRequired = WS_AUTH_REQUIRED;
    let userId: string | null = null;

    if (authRequired && !jwtSecretBytes) {
        ws.close(POLICY_VIOLATION, 'Server auth misconfigured');
        return;
    }

    if (!token && authRequired) {
        ws.close(POLICY_VIOLATION, 'Token required');
        return;
    }

    if (token && jwtSecretBytes) {
        userId = await verifyTokenUserId(token);
        if (!userId) {
            if (authRequired) {
                ws.close(POLICY_VIOLATION, 'Invalid token');
                return;
            }
            logger.warn('Received invalid websocket token, allowing anonymous connection');
        }
    } else if (token && !jwtSecretBytes) {
        logger.warn('WebSocket token supplied but JWT secret is not configured; allowing anonymous connection');
    }

    const client: ClientSubscription = {
        ws,
        symbols: new Set<string>(),
        userId,
        connectedAt: Date.now()
    };

    clients.add(client);
    logger.info({ userId: client.userId, connectedClients: clients.size }, 'Client connected');

    sendJson(ws, { type: 'connected' });

    ws.on('message', (message: WebSocket.RawData) => {
        const payloadSize = messageSizeBytes(message);
        if (payloadSize > MAX_MESSAGE_SIZE_BYTES) {
            rejectedMessages++;
            sendJson(ws, { type: 'error', error: 'Message too large' });
            ws.close(POLICY_VIOLATION, 'Message too large');
            return;
        }

        try {
            const text = Buffer.isBuffer(message) ? message.toString('utf-8') : String(message);
            const data = JSON.parse(text);
            if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
                rejectedMessages++;
                sendJson(ws, { type: 'error', error: 'Invalid message schema' });
                return;
            }

            const type = (data as any).type as string;
            if ((type === 'subscribe' || type === 'unsubscribe') && !Array.isArray((data as any).symbols)) {
                rejectedMessages++;
                sendJson(ws, { type: 'error', error: 'symbols array required' });
                return;
            }

            const symbols = normalizeSymbols((data as any).symbols);
            if (type === 'subscribe') {
                handleSubscribe(client, symbols);
                return;
            }
            if (type === 'unsubscribe') {
                handleUnsubscribe(client, symbols);
                return;
            }

            rejectedMessages++;
            sendJson(ws, { type: 'error', error: 'Unsupported message type' });
        } catch (error) {
            rejectedMessages++;
            logger.warn({ err: error, userId: client.userId }, 'Failed to parse client message');
            sendJson(ws, { type: 'error', error: 'Invalid JSON payload' });
        }
    });

    ws.on('close', () => {
        handleClientDisconnect(client);
        logger.info({ userId: client.userId, connectedClients: clients.size }, 'Client disconnected');
    });

    ws.on('error', (error) => {
        logger.warn({ err: error, userId: client.userId }, 'WebSocket client error');
    });
}

function handleSubscribe(client: ClientSubscription, symbols: string[]) {
    if (symbols.length === 0) {
        rejectedMessages++;
        sendJson(client.ws, { type: 'error', error: 'symbols array required' });
        return;
    }
    if (symbols.length > MAX_SYMBOLS_PER_CLIENT) {
        rejectedMessages++;
        sendJson(client.ws, {
            type: 'error',
            error: `Too many symbols in single request (max ${MAX_SYMBOLS_PER_CLIENT})`
        });
        return;
    }

    const added: string[] = [];
    const rejected: string[] = [];
    const perSymbol: Array<{ symbol: string; subscribers: number }> = [];

    for (const symbol of symbols) {
        if (client.symbols.has(symbol)) continue;
        if (client.symbols.size >= MAX_SYMBOLS_PER_CLIENT) {
            rejected.push(symbol);
            continue;
        }

        client.symbols.add(symbol);
        addSymbolSubscriber(symbol, client);

        const count = globalSubscriptions.get(symbol) || 0;
        const next = count + 1;
        globalSubscriptions.set(symbol, next);
        perSymbol.push({ symbol, subscribers: next });
        added.push(symbol);

        if (count === 0) {
            marketFeedSupervisor.subscribe(symbol);
            logger.info({ symbol }, 'Subscribed upstream (first client)');
        }
    }

    sendJson(client.ws, {
        type: 'subscribed',
        added,
        rejected,
        total: client.symbols.size
    });

    logger.info(
        {
            userId: client.userId,
            addedCount: added.length,
            rejectedCount: rejected.length,
            totalClientSymbols: client.symbols.size,
            perSymbol,
            globalSubscriptions: globalSubscriptions.size
        },
        'Client subscribed'
    );
}

function handleUnsubscribe(client: ClientSubscription, symbols: string[]) {
    if (symbols.length === 0) return;

    const removed: string[] = [];
    const ignored: string[] = [];
    const perSymbol: Array<{ symbol: string; subscribers: number }> = [];

    for (const symbol of symbols) {
        if (!client.symbols.has(symbol)) {
            ignored.push(symbol);
            continue;
        }

        client.symbols.delete(symbol);
        removeSymbolSubscriber(symbol, client);
        removed.push(symbol);

        const count = globalSubscriptions.get(symbol) || 0;
        if (count <= 1) {
            globalSubscriptions.delete(symbol);
            perSymbol.push({ symbol, subscribers: 0 });
            marketFeedSupervisor.unsubscribe(symbol);
            logger.info({ symbol }, 'Unsubscribed upstream (last client)');
        } else {
            const next = count - 1;
            globalSubscriptions.set(symbol, next);
            perSymbol.push({ symbol, subscribers: next });
        }
    }

    sendJson(client.ws, {
        type: 'unsubscribed',
        removed,
        ignored,
        total: client.symbols.size
    });

    logger.info(
        {
            userId: client.userId,
            removedCount: removed.length,
            ignoredCount: ignored.length,
            totalClientSymbols: client.symbols.size,
            perSymbol,
            globalSubscriptions: globalSubscriptions.size
        },
        'Client unsubscribed'
    );
}

function handleClientDisconnect(client: ClientSubscription) {
    if (!clients.has(client)) return;

    // Unsubscribe from all symbols
    const symbols = Array.from(client.symbols);
    if (symbols.length > 0) {
        handleUnsubscribe(client, symbols);
    }

    clients.delete(client);
}
