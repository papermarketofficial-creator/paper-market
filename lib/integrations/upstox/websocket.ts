/**
 * Upstox WebSocket Client
 * 
 * Connects to Upstox real-time market data feed.
 * Uses UpstoxTokenProvider for authentication.
 */

import { WebSocket } from 'ws';
import { UpstoxTokenProvider } from './token-provider';
import { logger } from "@/lib/logger";

type MarketUpdateCallback = (data: unknown) => void;

// Reconnection constants
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

export class UpstoxWebSocket {
    private ws: WebSocket | null = null;
    private tokenProvider: UpstoxTokenProvider;
    private subscriptions: Set<string> = new Set();
    private onUpdate: MarketUpdateCallback | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private reconnectAttempts: number = 0;
    private isConnected: boolean = false;
    private isConnecting: boolean = false;

    constructor() {
        this.tokenProvider = new UpstoxTokenProvider();
    }

    /**
     * Connect to Upstox WebSocket
     * @param onUpdate Callback for market data updates
     */
    async connect(onUpdate: MarketUpdateCallback): Promise<void> {
        // Prevent multiple simultaneous connection attempts
        if (this.isConnecting) {
            logger.debug("Connection already in progress");
            return;
        }

        if (this.isConnected && this.ws) {
            logger.debug("Already connected to Upstox WebSocket");
            return;
        }

        this.onUpdate = onUpdate;
        this.isConnecting = true;

        try {
            // Get token from provider
            const token = await this.tokenProvider.getToken();

            const url = "wss://api.upstox.com/v2/feed/market-data-feed";

            logger.info("Connecting to Upstox WebSocket...");

            this.ws = new WebSocket(url, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            this.ws.on('open', this.handleOpen.bind(this));
            this.ws.on('message', this.handleMessage.bind(this));
            this.ws.on('error', this.handleError.bind(this));
            this.ws.on('close', this.handleClose.bind(this));

        } catch (error) {
            this.isConnecting = false;
            logger.error({ err: error }, "Failed to initiate WebSocket connection");
            this.scheduleReconnect();
        }
    }

    /**
     * Subscribe to instruments
     * @param instrumentKeys Array of instrument keys (e.g., "NSE_EQ|RELIANCE")
     */
    subscribe(instrumentKeys: string[]): void {
        instrumentKeys.forEach(key => this.subscriptions.add(key));

        if (this.isConnected && this.ws) {
            this.sendSubscription(instrumentKeys);
        }
    }

    /**
     * Unsubscribe from instruments
     */
    unsubscribe(instrumentKeys: string[]): void {
        instrumentKeys.forEach(key => this.subscriptions.delete(key));

        if (this.isConnected && this.ws) {
            const payload = {
                guid: this.generateGuid(),
                method: "unsub",
                data: {
                    instrumentKeys: instrumentKeys
                }
            };
            this.ws.send(JSON.stringify(payload));
            logger.info({ count: instrumentKeys.length }, "Unsubscribed from instruments");
        }
    }

    /**
     * Gracefully disconnect
     */
    disconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        logger.info("Upstox WebSocket disconnected");
    }

    /**
     * Check if connected
     */
    get connected(): boolean {
        return this.isConnected;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private Methods
    // ─────────────────────────────────────────────────────────────────────────

    private handleOpen(): void {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        logger.info("Upstox WebSocket connected");

        // Resubscribe to existing subscriptions
        if (this.subscriptions.size > 0) {
            this.sendSubscription(Array.from(this.subscriptions));
        }
    }

    private handleMessage(data: Buffer): void {
        try {
            // Upstox sends binary Protobuf or JSON
            // Assuming JSON for this implementation
            const message = JSON.parse(data.toString());

            if (this.onUpdate) {
                this.onUpdate(message);
            }
        } catch {
            // Binary data or invalid JSON - ignore silently in production
            // Could be protobuf which needs special handling
        }
    }

    private handleError(error: Error): void {
        logger.error({ err: error }, "Upstox WebSocket error");
    }

    private handleClose(code: number, reason: Buffer): void {
        this.isConnected = false;
        this.isConnecting = false;
        logger.warn({ code, reason: reason.toString() }, "Upstox WebSocket disconnected");
        this.scheduleReconnect();
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    private scheduleReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            logger.error(
                { attempts: this.reconnectAttempts },
                "Max reconnection attempts reached. Giving up."
            );
            return;
        }

        // Exponential backoff with jitter
        const delay = Math.min(
            BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
            MAX_RECONNECT_DELAY_MS
        );

        this.reconnectAttempts++;

        logger.info(
            { delay: Math.round(delay), attempt: this.reconnectAttempts },
            "Scheduling WebSocket reconnect"
        );

        this.reconnectTimer = setTimeout(() => {
            if (this.onUpdate) {
                this.connect(this.onUpdate);
            }
        }, delay);
    }

    /**
     * Send subscription request to WebSocket
     */
    private sendSubscription(instrumentKeys: string[]): void {
        if (!this.ws || !this.isConnected) return;

        const payload = {
            guid: this.generateGuid(),
            method: "sub",
            data: {
                mode: "full",
                instrumentKeys: instrumentKeys
            }
        };

        this.ws.send(JSON.stringify(payload));
        logger.info({ count: instrumentKeys.length }, "Subscribed to instruments");
    }

    /**
     * Generate a unique GUID for requests
     */
    private generateGuid(): string {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }
}
