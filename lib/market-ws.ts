// ═══════════════════════════════════════════════════════════
// 📡 MARKET ENGINE WEBSOCKET CLIENT
// ═══════════════════════════════════════════════════════════
/**
 * WebSocket client for connecting to the market-engine service.
 * Replaces the SSE (Server-Sent Events) approach.
 * 
 * Architecture:
 * ```
 * Next.js Client → WebSocket → market-engine → Upstox
 * ```
 */

type MessageHandler = (data: any) => void;

interface MarketWsOptions {
    url: string;
    onTick?: MessageHandler;
    onCandle?: MessageHandler;
    onConnected?: () => void;
    onDisconnected?: () => void;
    onError?: (error: Event) => void;
}

class MarketWebSocket {
    private ws: WebSocket | null = null;
    private url: string;
    private handlers: {
        tick?: MessageHandler;
        candle?: MessageHandler;
        connected?: () => void;
        disconnected?: () => void;
        error?: (error: Event) => void;
    } = {};
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 5;
    private readonly RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
    private reconnectTimer: NodeJS.Timeout | null = null;
    private isIntentionalClose = false;

    constructor(options: MarketWsOptions) {
        this.url = options.url;
        this.handlers = {
            tick: options.onTick,
            candle: options.onCandle,
            connected: options.onConnected,
            disconnected: options.onDisconnected,
            error: options.onError
        };
    }

    configure(options: MarketWsOptions) {
        const nextUrl = options.url?.trim();
        if (nextUrl && nextUrl !== this.url) {
            this.url = nextUrl;
        }

        this.handlers = {
            tick: options.onTick,
            candle: options.onCandle,
            connected: options.onConnected,
            disconnected: options.onDisconnected,
            error: options.onError,
        };
    }

    connect() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            console.log('⚠️ WebSocket already connected');
            return;
        }

        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('✅ WebSocket connected to market-engine');
                this.reconnectAttempts = 0;
                this.handlers.connected?.();
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);

                    switch (message.type) {
                        case 'connected':
                            console.log('📡 Market engine acknowledged connection');
                            break;
                        case 'tick':
                            console.log('Tick instrumentKey:', message?.data?.instrumentKey);
                            this.handlers.tick?.(message.data);
                            break;
                        case 'candle':
                            this.handlers.candle?.(message.data);
                            break;
                        case 'heartbeat':
                            // Silent heartbeat
                            break;
                        default:
                            console.warn('Unknown message type:', message.type);
                    }
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            };

            this.ws.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
                this.handlers.error?.(error);
            };

            this.ws.onclose = () => {
                console.log('🔴 WebSocket disconnected');
                this.handlers.disconnected?.();

                if (!this.isIntentionalClose) {
                    this.attemptReconnect();
                }
            };
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.attemptReconnect();
        }
    }

    private attemptReconnect() {
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            console.error('❌ Max reconnect attempts reached');
            return;
        }

        const delay = this.RECONNECT_DELAYS[Math.min(this.reconnectAttempts, this.RECONNECT_DELAYS.length - 1)];
        this.reconnectAttempts++;

        console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }

    subscribe(symbols: string[]) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'subscribe',
                symbols
            }));
            console.log(`📡 Subscribed to ${symbols.length} symbols`);
        } else {
            console.warn('⚠️ Cannot subscribe: WebSocket not connected');
        }
    }

    unsubscribe(symbols: string[]) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'unsubscribe',
                symbols
            }));
            console.log(`📡 Unsubscribed from ${symbols.length} symbols`);
        }
    }

    disconnect() {
        this.isIntentionalClose = true;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        console.log('🔴 WebSocket disconnected (intentional)');
    }

    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}

// ═══════════════════════════════════════════════════════════
// 🛠️ SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════
let marketWsInstance: MarketWebSocket | null = null;

export function getMarketWebSocket(options?: MarketWsOptions): MarketWebSocket {
    if (!marketWsInstance && options) {
        marketWsInstance = new MarketWebSocket(options);
    } else if (marketWsInstance && options) {
        marketWsInstance.configure(options);
    }

    if (!marketWsInstance) {
        throw new Error('MarketWebSocket not initialized. Call with options first.');
    }

    return marketWsInstance;
}

export function destroyMarketWebSocket() {
    if (marketWsInstance) {
        marketWsInstance.disconnect();
        marketWsInstance = null;
    }
}
