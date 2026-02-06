
import { UpstoxWebSocket } from "@/lib/integrations/upstox/websocket";
import { logger } from "@/lib/logger";
import { EventEmitter } from "events";
import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { tickBus } from "@/lib/trading/tick-bus";
import { UpstoxAdapter } from "@/lib/integrations/upstox/upstox-adapter";
import "@/lib/trading/init-realtime"; // Auto-wire TickBus subscriptions
import { marketFeedSupervisor } from "@/lib/trading/market-feed-supervisor";

// ═══════════════════════════════════════════════════════════
// 🛠️ SINGLETON PATTERN: Global declaration for Next.js hot reload
// ═══════════════════════════════════════════════════════════
declare global {
    var __realTimeMarketServiceInstance: RealTimeMarketService | undefined;
}

interface Quote {
    symbol: string;
    price: number;
    close?: number; // Previous Close for Change Calculation
    timestamp?: number; // Unix timestamp in milliseconds from Upstox ltt field
    volume?: number;
    lastUpdated: Date;
}

class RealTimeMarketService extends EventEmitter {
    private static instance: RealTimeMarketService | null = null;
    
    private ws: UpstoxWebSocket;
    private prices: Map<string, Quote> = new Map();
    private subscribers: Set<string> = new Set();
    private initialized: boolean = false;
    private isInitializing: boolean = false; // Guard against concurrent initialization
    private instrumentPrefix = "NSE_EQ|";
    
    private isinMap: Map<string, string> = new Map(); // Trading Symbol -> ISIN
    private reverseIsinMap: Map<string, string> = new Map(); // ISIN -> Trading Symbol
    private adapter: UpstoxAdapter | null = null; // Broker adapter

    // ═══════════════════════════════════════════════════════════
    // 🛠️ PRIVATE CONSTRUCTOR: Prevent direct instantiation
    // ═══════════════════════════════════════════════════════════
    private constructor() {
        super();
        this.ws = UpstoxWebSocket.getInstance();
        this.prices = new Map();
    }

    // ═══════════════════════════════════════════════════════════
    // 🛠️ SINGLETON ACCESSOR: Get or create instance
    // ═══════════════════════════════════════════════════════════
    public static getInstance(): RealTimeMarketService {
        // Use Node.js global for true singleton across module reloads
        if (!global.__realTimeMarketServiceInstance) {
            console.log("🆕 Creating RealTimeMarketService singleton");
            global.__realTimeMarketServiceInstance = new RealTimeMarketService();
        } else {
            console.log("♻️ Reusing RealTimeMarketService singleton");
        }
        return global.__realTimeMarketServiceInstance;
    }

    /**
     * Initialize the Real-Time Service
     */
    async initialize(): Promise<void> {
        // ═══════════════════════════════════════════════════════════
        // 🛠️ GUARD: Already initialized
        // ═══════════════════════════════════════════════════════════
        if (this.initialized) {
            console.log("✅ RealTimeMarketService already initialized");
            return;
        }

        // ═══════════════════════════════════════════════════════════
        // 🛠️ GUARD: Initialization in progress
        // ═══════════════════════════════════════════════════════════
        if (this.isInitializing) {
            console.log("⏳ Initialization in progress, waiting...");
            // Wait for initialization to complete
            await new Promise<void>(resolve => {
                const interval = setInterval(() => {
                    if (this.initialized || !this.isInitializing) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 100);
            });
            return;
        }

        this.isInitializing = true;

        try {
            await this.loadInstruments();
            
            // ═══════════════════════════════════════════════════════════
            // 🛠️ INITIALIZE ADAPTER: Create broker adapter with ISIN map
            // ═══════════════════════════════════════════════════════════
            this.adapter = new UpstoxAdapter(this.reverseIsinMap);
            console.log("✅ UpstoxAdapter initialized with", this.reverseIsinMap.size, "symbols");
            
            // ═══════════════════════════════════════════════════════════
            // 🔥 CRITICAL: Use MarketFeedSupervisor (institutional-grade)
            // ═══════════════════════════════════════════════════════════
            console.log("🔌 Wiring MarketFeedSupervisor to TickBus...");
            
            // Wire supervisor ticks to our TickBus
            marketFeedSupervisor.on('tick', (data: any) => {
                this.handleMarketUpdate(data);
            });
            
            // Initialize the feed
            await marketFeedSupervisor.initialize();
            
            this.initialized = true;
            logger.info("RealTimeMarketService initialized with MarketFeedSupervisor");
        } catch (error) {
            logger.error({ err: error }, "Failed to initialize RealTimeMarketService");
            throw error;
        } finally {
            this.isInitializing = false;
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
            
            // Resolve to ISIN if possible
            const isinKey = this.isinMap.get(pureSymbol) || this.isinMap.get(fullSymbolKey);
            const finalKey = isinKey || fullSymbolKey;

            if (!this.subscribers.has(finalKey)) {
                this.subscribers.add(finalKey);
                keysToSubscribe.push(finalKey);
            }
        });

        if (keysToSubscribe.length > 0) {
            console.log(`📡 RealTimeMarketService: Subscribing to ${keysToSubscribe.length} symbols via MarketFeedSupervisor`);
            
            // 🔥 CRITICAL: Delegate to MarketFeedSupervisor
            // It handles ref-counting, batching, and health monitoring
            marketFeedSupervisor.subscribe(keysToSubscribe);
        }
    }

    /**
     * Unsubscribe from instruments
     */
    async unsubscribe(symbols: string[]): Promise<void> {
        if (!this.initialized) return;

        console.log(`📡 RealTimeMarketService: Unsubscribing from ${symbols.length} symbols`);
        
        // Delegate to MarketFeedSupervisor (which handles ref-counting)
        marketFeedSupervisor.unsubscribe(symbols);

        // Update local set
        symbols.forEach(s => {
            // We don't remove from this.subscribers immediately because 
            // supervisor might still have other subscribers for these symbols.
            // But we should probably keep local state in sync if we want strict tracking.
            // For now, let's trust supervisor.
        });
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
        // ═══════════════════════════════════════════════════════════
        // 🛠️ GUARD: Validate data
        // ═══════════════════════════════════════════════════════════
        if (!data || typeof data !== 'object') {
            return;
        }

        // ═══════════════════════════════════════════════════════════
        // 🛠️ ADAPTER NORMALIZATION: Upstox → NormalizedTick
        // ═══════════════════════════════════════════════════════════
        if (!this.adapter) {
            console.error("❌ Adapter not initialized");
            return;
        }

        const ticks = this.adapter.normalize(data);
        
        if (ticks.length === 0) {
            // Sample logging for non-feed messages
            if (data.type === "market_info" && Math.random() < 0.1) {
                console.log("ℹ️ Market info message received");
            }
            return;
        }

        // ═══════════════════════════════════════════════════════════
        // 🚌 TICK BUS EMISSION: Distribute to all subscribers
        // ═══════════════════════════════════════════════════════════
        for (const tick of ticks) {
            // Update local cache for legacy compatibility
            const quote: Quote = {
                symbol: tick.symbol,
                price: tick.price,
                close: tick.close,
                timestamp: tick.timestamp * 1000, // Convert back to ms for Quote interface
                volume: tick.volume,
                lastUpdated: new Date()
            };
            this.prices.set(tick.symbol, quote);

            // Emit to TickBus (new architecture)
            tickBus.emitTick(tick);

            // Legacy event emission (for backward compatibility)
            this.emit("tick", quote);

            // Sample logging (1% of ticks)
            if (process.env.DEBUG_MARKET === 'true' && Math.random() < 0.01) {
                console.log(`📩 TICK: ${tick.symbol} @ ${tick.price} (${new Date(tick.timestamp * 1000).toISOString()})`);
            }
        }
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
        // ═══════════════════════════════════════════════════════════
        // 🛠️ GUARD: Only load once
        // ═══════════════════════════════════════════════════════════
        if (this.isinMap.size > 0) {
            console.log("✅ Instruments already loaded, count:", this.isinMap.size);
            return;
        }

        try {
            console.log("📂 Loading instruments for dynamic mapping...");
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

// ═══════════════════════════════════════════════════════════
// 🛠️ EXPORT SINGLETON INSTANCE (not class)
// ═══════════════════════════════════════════════════════════
export const realTimeMarketService = RealTimeMarketService.getInstance();
