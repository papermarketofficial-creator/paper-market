
import { UpstoxWebSocket } from "@/lib/integrations/upstox/websocket";
import { logger } from "@/lib/logger";
import { EventEmitter } from "events";

interface Quote {
    symbol: string;
    price: number;
    lastUpdated: Date;
}

class RealTimeMarketService extends EventEmitter {
    private ws: UpstoxWebSocket;
    private prices: Map<string, Quote> = new Map();
    private subscribers: Set<string> = new Set();
    private initialized: boolean = false;

    constructor() {
        super();
        this.ws = new UpstoxWebSocket();
    }

    /**
     * Initialize the Real-Time Service
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            await this.ws.connect(this.handleMarketUpdate.bind(this));
            this.initialized = true;
            logger.info("RealTimeMarketService initialized");
        } catch (error) {
            logger.error({ err: error }, "Failed to initialize RealTimeMarketService");
        }
    }

    /**
     * Subscribe to instruments for real-time updates
     * @param symbols List of trading symbols
     */
    subscribe(symbols: string[]): void {
        const newSymbols = symbols.filter(s => !this.subscribers.has(s));
        if (newSymbols.length > 0) {
            newSymbols.forEach(s => this.subscribers.add(s));

            // Map internal symbols to Upstox Instrument Keys
            // For Phase 8, we assume symbols ARE the keys or mapped transparently
            // e.g., "NSE_EQ|RELIANCE"
            this.ws.subscribe(newSymbols);
            logger.info({ count: newSymbols.length }, "Subscribed to new symbols");
        }
    }

    /**
     * Handle incoming market data from WebSocket
     */
    private handleMarketUpdate(data: any): void {
        // Normalize data based on Upstox structure
        // Assuming 'data.feeds' contains symbol: { ... } map
        const feeds = data.feeds || {};

        Object.keys(feeds).forEach(symbol => {
            const feed = feeds[symbol];
            const ltp = feed.ltp || feed.ff?.marketFF?.ltp || 0; // Adjust based on actual payload

            if (ltp > 0) {
                const quote = {
                    symbol: symbol,
                    price: ltp,
                    lastUpdated: new Date()
                };
                this.prices.set(symbol, quote);

                // Broadcast to SSE subscribers via Event Emitter
                this.emit('tick', quote);
            }
        });
    }

    /**
     * Get latest quote from cache
     */
    getQuote(symbol: string): Quote | null {
        return this.prices.get(symbol) || null;
    }

    /**
     * Get all cached quotes
     */
    getAllQuotes(): Record<string, number> {
        const quotes: Record<string, number> = {};
        for (const [symbol, quote] of this.prices.entries()) {
            quotes[symbol] = quote.price;
        }
        return quotes;
    }
}

export const realTimeMarketService = new RealTimeMarketService();
