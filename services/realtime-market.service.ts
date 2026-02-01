
import { UpstoxWebSocket } from "@/lib/integrations/upstox/websocket";
import { logger } from "@/lib/logger";
import { EventEmitter } from "events";
import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface Quote {
    symbol: string;
    price: number;
    close?: number; // Previous Close for Change Calculation
    lastUpdated: Date;
}

class RealTimeMarketService extends EventEmitter {
    private ws: UpstoxWebSocket;
    private prices: Map<string, Quote> = new Map();
    private subscribers: Set<string> = new Set();
    private initialized: boolean = false;
    private instrumentPrefix = "NSE_EQ|";
    
    private isinMap: Map<string, string> = new Map(); // Trading Symbol -> ISIN
    private reverseIsinMap: Map<string, string> = new Map(); // ISIN -> Trading Symbol



    public constructor() {
        super();
        this.ws = new UpstoxWebSocket();
        this.prices = new Map();
        
        // Initialize Setup
        this.initialize();
    }

    /**
     * Initialize the Real-Time Service
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            await this.loadInstruments();
            await this.ws.connect(this.handleMarketUpdate.bind(this));
            this.initialized = true;
            logger.info("RealTimeMarketService initialized");
        } catch (error) {
            logger.error({ err: error }, "Failed to initialize RealTimeMarketService");
        }
    }

    /**
     * Subscribe to instruments for real-time updates
     * @param symbols List of trading symbols (e.g. "RELIANCE")
     */
    async subscribe(symbols: string[]): Promise<void> {
        // Ensure initialized to have maps ready
        if (!this.initialized) await this.initialize();

        const keysToSubscribe: string[] = [];

        symbols.forEach(s => {
            // Normalize symbol
            const pureSymbol = s.includes("|") ? s.split("|")[1] : s;
            const fullSymbolKey = s.includes("|") ? s : `${this.instrumentPrefix}${s}`;
            
            // Resolve to ISIN if possible, otherwise use as is
            // Map keys are like "RELIANCE" -> "INE..." (pure)
            // or "NSE_EQ|RELIANCE" -> "NSE_EQ|INE..." (full)
            // Ideally we map pure symbol to full ISIN key

            // Try to find mapped ISIN key
            const isinKey = this.isinMap.get(pureSymbol) || this.isinMap.get(fullSymbolKey);
            const finalKey = isinKey || fullSymbolKey; // Fallback to original if no map found (e.g. MCX)

            if (!this.subscribers.has(finalKey)) {
                this.subscribers.add(finalKey);
                keysToSubscribe.push(finalKey);
            }
        });

        if (keysToSubscribe.length > 0) {
            // 1. Add to WebSocket subscription queue BEFORE connecting
            this.ws.subscribe(keysToSubscribe);
            logger.info({ count: keysToSubscribe.length, keys: keysToSubscribe }, "Subscribed to new symbols");

            // 2. Initialize connection if not already done
            if (!this.initialized) await this.initialize();

            // 3. Seed cache with snapshot (industry-standard pattern)
            // V3 WebSocket is delta-only, so we need initial prices from REST API
            this.seedSnapshotPrices(keysToSubscribe);
        }
    }

    /**
     * Fetch snapshot prices via REST API and seed the cache
     * This provides immediate price visibility before first trade occurs
     */
    /**
     * Fetch snapshot prices via REST API and seed the cache
     * This provides immediate price visibility before first trade occurs
     */
    private async seedSnapshotPrices(instrumentKeys: string[]): Promise<void> {
        try {
            // ─────────────────────────────────────────────────────────────────
            // 🛠️ ISIN MAPPING (Required for REST SNAPSHOT)
            // WebSocket uses "NSE_EQ|RELIANCE"
            // REST uses "NSE_EQ|INE002A01018"
            // We map known symbols here for verification. 
            // In production, fetch this from DB/Instruments API.
            // ─────────────────────────────────────────────────────────────────
            // ─────────────────────────────────────────────────────────────────
            const mappedKeys: string[] = [];

            instrumentKeys.forEach(key => {
                // key is likely an ISIN key based on subscribe()
                // Just use it directly
                mappedKeys.push(key);
            });

            if (mappedKeys.length === 0) return;

            // Dynamic import to avoid circular dependencies
            const { UpstoxService } = await import("@/services/upstox.service");
            const quotes = await UpstoxService.getSystemQuotes(mappedKeys);

            for (const [isinKey, price] of Object.entries(quotes)) {
                if (price > 0) {
                    // Map back ISIN -> Symbol (e.g. NSE_EQ|INE... -> NSE_EQ|RELIANCE)
                    // Map back ISIN -> Symbol
                    const originalKey = isinKey;
                    const pureIsin = isinKey.split("|")[1] || isinKey;
                    const tradingSymbol = this.reverseIsinMap.get(pureIsin) || pureIsin;
                    
                    const pureSymbol = tradingSymbol.split("|")[1] || tradingSymbol;
                    
                    const quote: Quote = {
                        symbol: pureSymbol,
                        price: Number(price),
                        lastUpdated: new Date()
                    };
                    this.prices.set(pureSymbol, quote);
                    this.prices.set(originalKey, quote);
                    
                    // Emit tick to populate UI immediately
                    this.emit('tick', quote);
                }
            }
            logger.info({ count: Object.keys(quotes).length, mapped: mappedKeys.length }, "Snapshot prices seeded to cache (ISIN Mapped)");
        } catch (error) {
            logger.error({ err: error }, "Failed to seed snapshot prices");
        }
    }

    /**
     * Handle incoming market data from WebSocket
     */
    private handleMarketUpdate(data: any): void {
        // Debug: Log first few updates to understand structure
        if (Math.random() < 0.01) { // 1% sample log
             console.log("📉 Market Data Payload:", JSON.stringify(data).slice(0, 200));
        }

        // Handle non-feed messages (market_info, etc.)
        if (data.type === "market_info") {
            // Market status update - log but don't process as quote
            return;
        }

        // Upstox V3 ltpc mode structure:
        // { "feeds": { "NSE_EQ|RELIANCE": { "ltpc": { "ltp": 2500, "ltt": "...", "ltq": 100, "cp": 2480 } } } }
        const feeds = data.feeds || {};

            // 2. Process Feeds
            Object.keys(feeds).forEach(key => {
                const feed = feeds[key];
                
                // Extract LTP (Last Traded Price)
                const ltpc = feed.ltpc;
                
                if (ltpc) {
                    const price = ltpc.ltp;
                    const close = ltpc.cp;
                    // const volume = ltpc.vol; // Verify if available in V3
                    
                    // ─────────────────────────────────────────────────────────────────
                    // 🛠️ FIX: Map ISIN (e.g. INE002A01018) -> Trading Symbol (RELIANCE)
                    // The feed key is likely "NSE_EQ|INE002A01018"
                    // ─────────────────────────────────────────────────────────────────
                    const pureKey = key.split("|")[1] || key;
                    // Resolve pure ISIN (INE...) to Trading Symbol (RELIANCE)
                    const tradingSymbol = this.reverseIsinMap.get(pureKey) || pureKey;

                    // Only emit if we have a valid price
                    if (price !== undefined) {
                        const quote: Quote = {
                            symbol: tradingSymbol, // Send "RELIANCE" instead of "INE..."
                            price: price,
                            close: close,
                            // volume: volume,
                            lastUpdated: new Date()
                        };

                        // Store
                        this.prices.set(tradingSymbol, quote);
                        this.prices.set(key, quote); // Also store by original key

                        // Emit 'tick' event
                        this.emit('tick', quote);
                    }
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
     * Check if we have a "Fresh" quote (received < X seconds ago)
     */
    hasFreshQuote(symbol: string, maxAgeSeconds: number = 60): boolean {
        const quote = this.getQuote(symbol);
        if (!quote) return false;

        const age = (new Date().getTime() - quote.lastUpdated.getTime()) / 1000;
        return age < maxAgeSeconds;
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

    /**
     * Load all instruments from database to build ISIN maps.
     */
    private async loadInstruments(): Promise<void> {
        try {
            logger.info("Loading instruments for dynamic mapping...");
            const allInstruments = await db
                .select({
                    instrumentToken: instruments.instrumentToken, // "NSE_EQ|INE..."
                    tradingsymbol: instruments.tradingsymbol,     // "RELIANCE"
                    exchangeToken: instruments.exchangeToken      // "2885"
                })
                .from(instruments)
                .where(eq(instruments.isActive, true));

            this.isinMap.clear();
            this.reverseIsinMap.clear();

            for (const instr of allInstruments) {
                // Map: RELIANCE -> NSE_EQ|INE...
                this.isinMap.set(instr.tradingsymbol, instr.instrumentToken);
                
                // Map: INE... -> RELIANCE (for reverse lookup from feed)
                // instrumentToken is usually "NSE_EQ|INE..."
                const parts = instr.instrumentToken.split("|");
                if (parts.length === 2) {
                    const isin = parts[1]; // INE...
                    this.reverseIsinMap.set(isin, instr.tradingsymbol);
                } else {
                    // Fallback using whole token
                    this.reverseIsinMap.set(instr.instrumentToken, instr.tradingsymbol);
                }
            }

            logger.info({ count: allInstruments.length }, "Instruments loaded & mapped");
        } catch (error) {
            logger.error({ err: error }, "Failed to load instruments map");
        }
    }
}

export const realTimeMarketService = new RealTimeMarketService();
