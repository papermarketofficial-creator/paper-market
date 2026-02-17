
import { UpstoxWebSocket } from "@/lib/integrations/upstox/websocket";
import { logger } from "@/lib/logger";
import { EventEmitter } from "events";
import { tickBus } from "@/lib/trading/tick-bus";
import { UpstoxAdapter } from "@/lib/integrations/upstox/upstox-adapter";
import "@/lib/trading/init-realtime"; // Auto-wire TickBus subscriptions
import { marketFeedSupervisor } from "@/lib/trading/market-feed-supervisor";
import { toInstrumentKey } from "@/lib/market/symbol-normalization";
import { feedHealthService, recordFeedPrice } from "@/services/feed-health.service";
import { instrumentRepository } from "@/lib/instruments/repository";

// ═══════════════════════════════════════════════════════════
// 🛠️ SINGLETON PATTERN: Global declaration for Next.js hot reload
// ═══════════════════════════════════════════════════════════
declare global {
    var __realTimeMarketServiceInstance: RealTimeMarketService | undefined;
}

interface Quote {
    instrumentKey: string;
    symbol: string;
    key?: string; // deprecated alias for transition
    price: number;
    close?: number; // Previous Close for Change Calculation
    timestamp?: number; // Unix timestamp in milliseconds from Upstox ltt field
    volume?: number;
    lastUpdated: Date;
}

class RealTimeMarketService extends EventEmitter {
    private ws: UpstoxWebSocket;
    private prices: Map<string, Quote> = new Map();
    private quotesByInstrument: Map<string, Quote> = new Map();
    private subscribers: Map<string, number> = new Map();
    private initialized: boolean = false;
    private isInitializing: boolean = false; // Guard against concurrent initialization
    
    private isinMap: Map<string, string> = new Map(); // Trading Symbol -> ISIN
    private reverseIsinMap: Map<string, string> = new Map(); // ISIN -> Trading Symbol
    private adapter: UpstoxAdapter | null = null; // Broker adapter
    private snapshotWarmupPromise: Promise<void> | null = null;
    private supervisorTickAttached = false;
    private readonly onSupervisorTick = (data: any): void => {
        this.handleMarketUpdate(data);
    };
    
    private syncFeedConnectionState(): void {
        const connected = marketFeedSupervisor.getHealthMetrics().isConnected;
        feedHealthService.setWebsocketConnected(connected);
    }

    private normalizeSymbolKey(value: string): string {
        return value.replace(/\s+/g, "").toUpperCase();
    }

    private canonicalizeSymbol(raw: string): string {
        const trimmed = String(raw || "").trim();
        const normalized = this.normalizeSymbolKey(trimmed);
        const indexAliases: Record<string, string> = {
            NIFTY: "NIFTY 50",
            NIFTY50: "NIFTY 50",
            NIFTY_50: "NIFTY 50",
            BANKNIFTY: "NIFTY BANK",
            NIFTYBANK: "NIFTY BANK",
            FINNIFTY: "NIFTY FIN SERVICE",
            NIFTYFINSERVICE: "NIFTY FIN SERVICE",
        };

        return indexAliases[normalized] || trimmed.toUpperCase();
    }

    private resolveSymbolFromFeedKey(feedKey: string): string {
        const raw = String(feedKey || "").trim();
        if (!raw) return "";

        const sep = raw.includes("|") ? "|" : raw.includes(":") ? ":" : "";
        const rhs = sep ? (raw.split(sep)[1] || raw) : raw;
        const fromIsin =
            this.reverseIsinMap.get(rhs) ||
            this.reverseIsinMap.get(rhs.toUpperCase()) ||
            this.reverseIsinMap.get(raw);

        return this.canonicalizeSymbol(fromIsin || rhs || raw);
    }

    // ═══════════════════════════════════════════════════════════
    // 🛠️ PRIVATE CONSTRUCTOR: Prevent direct instantiation
    // ═══════════════════════════════════════════════════════════
    private constructor() {
        super();
        this.setMaxListeners(50); // Prevent EventEmitter memory leak warnings
        this.ws = UpstoxWebSocket.getInstance();
        this.prices = new Map();
    }

    // ═══════════════════════════════════════════════════════════
    // 🛠️ SINGLETON ACCESSOR: Get or create instance
    // ═══════════════════════════════════════════════════════════
    public static getInstance(): RealTimeMarketService {
        const globalRef = globalThis as typeof globalThis & {
            __realTimeMarketServiceInstance?: RealTimeMarketService;
        };

        if (!globalRef.__realTimeMarketServiceInstance) {
            console.log("🆕 Creating RealTimeMarketService singleton");
            globalRef.__realTimeMarketServiceInstance = new RealTimeMarketService();
        } else {
            console.log("♻️ Reusing RealTimeMarketService singleton");
        }
        return globalRef.__realTimeMarketServiceInstance;
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
            
            // Wire supervisor ticks only once per process.
            if (!this.supervisorTickAttached) {
                marketFeedSupervisor.on("tick", this.onSupervisorTick);
                this.supervisorTickAttached = true;
            }
            
            // Initialize the feed
            await marketFeedSupervisor.initialize();
            this.syncFeedConnectionState();

            // Start MTM engine after market feed + TickBus wiring are active.
            const { mtmEngineService } = await import("@/services/mtm-engine.service");
            await mtmEngineService.initialize();
            
            this.initialized = true;
            logger.info("RealTimeMarketService initialized with MarketFeedSupervisor");
        } catch (error) {
            this.syncFeedConnectionState();
            logger.error({ err: error }, "Failed to initialize RealTimeMarketService");
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    /**
     * Resolve a user-facing symbol into the feed key used internally.
     * Uses the pre-loaded instrument map for segment-aware resolution.
     * STRICT: No silent fallback - logs error and returns empty string on miss.
     */
    private resolveFeedKey(symbol: string): string {
        // Already a proper instrument key (contains segment prefix)
        if (symbol.includes('|')) {
            return toInstrumentKey(symbol);
        }
        
        const canonicalSymbol = this.canonicalizeSymbol(symbol);
        
        // Look up from pre-loaded instrument map (Trading Symbol → ISIN)
        // The isinMap is populated during loadInstruments() with ALL active instruments
        const isin = this.isinMap.get(symbol) || 
                     this.isinMap.get(canonicalSymbol) ||
                     this.isinMap.get(symbol.toUpperCase());
        
        if (isin) {
            // For indices, use special formatting
            const isIndex = canonicalSymbol.includes('NIFTY') || 
                           canonicalSymbol.includes('SENSEX') || 
                           canonicalSymbol.includes('BANKEX');
            
            if (isIndex) {
                // Use mixed-case format for indices
                const formattedSymbol = canonicalSymbol
                    .toLowerCase()
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                return `NSE_INDEX|${formattedSymbol}`;
            }
            
            // For equity/F&O, return the ISIN-based key
            // The isinMap stores tradingsymbol → ISIN (which is the second part of instrumentToken)
            // We need to determine the segment. For now, default to NSE_EQ for equity
            // F&O instruments will have their full token in the map
            return isin.includes('|') ? isin : `NSE_EQ|${isin}`;
        }
        
        // STRICT: No silent fallback - log error and return empty
        logger.warn({ symbol, canonicalSymbol }, 'resolveFeedKey: symbol not found in instrument map, skipping subscription');
        return '';
    }

    /**
     * Subscribe to instruments for real-time updates
     * @param symbols List of trading symbols (e.g. "RELIANCE")
     */
    async subscribe(symbols: string[]): Promise<void> {
        // Ensure initialized to have maps ready
        if (!this.initialized) await this.initialize();

        const keysToSubscribe = Array.from(new Set(symbols.map((s) => this.resolveFeedKey(s))));
        if (keysToSubscribe.length === 0) return;

        // Local ref-count mirrors high-level consumer demand.
        // MarketFeedSupervisor has its own ref-count and is the execution authority.
        keysToSubscribe.forEach((key) => {
            const count = this.subscribers.get(key) ?? 0;
            this.subscribers.set(key, count + 1);
        });

        console.log(`📡 RealTimeMarketService: Subscribing to ${keysToSubscribe.length} symbols via MarketFeedSupervisor`);
        
        // 🔥 CRITICAL: Delegate to MarketFeedSupervisor
        // It handles ref-counting, batching, and health monitoring
        marketFeedSupervisor.subscribe(keysToSubscribe);
        this.syncFeedConnectionState();
    }

    /**
     * Unsubscribe from instruments
     */
    async unsubscribe(symbols: string[]): Promise<void> {
        if (!this.initialized) return;

        const keysToUnsubscribe = symbols.map(s => this.resolveFeedKey(s));
        const uniqueKeys = Array.from(new Set(keysToUnsubscribe));

        const approvedKeys: string[] = [];
        uniqueKeys.forEach(key => {
            const count = this.subscribers.get(key) ?? 0;
            if (count <= 0) return;

            if (count === 1) {
                this.subscribers.delete(key);
            } else {
                this.subscribers.set(key, count - 1);
            }
            approvedKeys.push(key);
        });

        if (approvedKeys.length === 0) return;

        console.log(`📡 RealTimeMarketService: Unsubscribing from ${approvedKeys.length} symbols`);
        marketFeedSupervisor.unsubscribe(approvedKeys);
        this.syncFeedConnectionState();
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
            const mappedKeys = Array.from(
                new Set(instrumentKeys.map((key) => String(key || "").trim()).filter(Boolean))
            );
            if (mappedKeys.length === 0) return;

            const { UpstoxService } = await import("@/services/upstox.service");
            const quotes = await UpstoxService.getSystemQuoteDetails(mappedKeys);
            const now = Date.now();

            for (const [feedKey, detail] of Object.entries(quotes)) {
                const price = Number(detail?.lastPrice);
                if (!Number.isFinite(price) || price <= 0) continue;

                const closePrice = Number(detail?.closePrice);
                const canonicalSymbol = this.resolveSymbolFromFeedKey(feedKey);
                if (!canonicalSymbol) continue;
                const mappedInstrumentToken =
                    this.isinMap.get(canonicalSymbol) ||
                    this.isinMap.get(canonicalSymbol.toUpperCase()) ||
                    this.isinMap.get(canonicalSymbol.replace(/\s+/g, "")) ||
                    feedKey;
                const instrumentKey = toInstrumentKey(mappedInstrumentToken);

                const quote: Quote = {
                    instrumentKey,
                    symbol: canonicalSymbol,
                    key: instrumentKey,
                    price,
                    close: Number.isFinite(closePrice) && closePrice > 0 ? closePrice : undefined,
                    timestamp: now,
                    lastUpdated: new Date(now),
                };

                this.prices.set(canonicalSymbol, quote);
                this.prices.set(instrumentKey, quote);
                this.quotesByInstrument.set(instrumentKey, quote);
                recordFeedPrice(instrumentKey, price, now);
            }

            logger.info(
                { requested: mappedKeys.length, hydrated: Object.keys(quotes).length },
                "Snapshot prices seeded from Upstox"
            );
        } catch (error) {
            logger.error({ err: error }, "Failed to seed snapshot prices");
        }
    }

    /**
     * Handle incoming market data from WebSocket
     */
    private handleMarketUpdate(data: any): void {
        this.syncFeedConnectionState();
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
            const canonicalSymbol = this.canonicalizeSymbol(tick.symbol || "");
            const instrumentKey = toInstrumentKey(tick.instrumentKey || "");
            if (!instrumentKey) continue;
            // Update local cache for legacy compatibility
            const quote: Quote = {
                instrumentKey,
                symbol: canonicalSymbol,
                key: instrumentKey,
                price: tick.price,
                close: tick.close,
                timestamp: tick.timestamp * 1000, // Convert back to ms for Quote interface
                volume: tick.volume,
                lastUpdated: new Date()
            };
            if (tick.symbol) {
                this.prices.set(tick.symbol, quote);
            }
            this.prices.set(quote.symbol, quote);
            this.prices.set(instrumentKey, quote);
            this.quotesByInstrument.set(instrumentKey, quote);

            // Emit to TickBus (new architecture)
            tickBus.emitTick(tick);

            // Legacy event emission (for backward compatibility)
            this.emit("tick", quote);

            // Sample logging (1% of ticks)
            if (process.env.DEBUG_MARKET === 'true' && Math.random() < 0.01) {
                console.log(`📩 TICK: ${instrumentKey} @ ${tick.price} (${new Date(tick.timestamp * 1000).toISOString()})`);
            }
        }
    }

    /**
     * Get latest quote from cache
     */
    getQuote(symbol: string): Quote | null {
        const instrumentKey = toInstrumentKey(symbol);
        const direct = this.prices.get(instrumentKey || symbol);
        if (direct) return direct;

        const canonical = this.canonicalizeSymbol(symbol);
        const key = this.normalizeSymbolKey(canonical);
        for (const quote of this.quotesByInstrument.values()) {
            if (this.normalizeSymbolKey(quote.symbol) === key) {
                return quote;
            }
        }
        return null;
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
        for (const [key, quote] of this.quotesByInstrument.entries()) {
            quotes[key] = quote.price;
        }
        return quotes;
    }

    async warmSnapshotForSymbols(symbols: string[]): Promise<void> {
        const uniqueSymbols = Array.from(
            new Set(symbols.map((s) => String(s || "").trim()).filter(Boolean))
        );
        if (uniqueSymbols.length === 0) return;

        if (!this.initialized) {
            await this.initialize();
        }

        if (this.snapshotWarmupPromise) {
            await this.snapshotWarmupPromise;
        }

        const missingSymbols = uniqueSymbols.filter((symbol) => {
            const quote = this.getQuote(symbol);
            return !(quote && Number.isFinite(quote.price) && quote.price > 0);
        });

        if (missingSymbols.length === 0) return;

        const feedKeys = Array.from(
            new Set(missingSymbols.map((symbol) => this.resolveFeedKey(symbol)))
        );

        const warmupTask = this.seedSnapshotPrices(feedKeys);
        this.snapshotWarmupPromise = warmupTask;
        try {
            await warmupTask;
        } finally {
            if (this.snapshotWarmupPromise === warmupTask) {
                this.snapshotWarmupPromise = null;
            }
        }
    }

    getSnapshotForSymbols(symbols: string[]): Array<{
        instrumentKey: string;
        symbol: string;
        key: string;
        price: number;
        close?: number;
        timestamp?: number;
    }> {
        const uniqueSymbols = Array.from(new Set(symbols.map((s) => String(s || "").trim()).filter(Boolean)));
        const snapshot: Array<{
            instrumentKey: string;
            symbol: string;
            key: string;
            price: number;
            close?: number;
            timestamp?: number;
        }> = [];
        const seen = new Set<string>();

        for (const symbol of uniqueSymbols) {
            const quote = this.getQuote(symbol);
            if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) continue;
            if (seen.has(quote.instrumentKey)) continue;
            seen.add(quote.instrumentKey);
            snapshot.push({
                instrumentKey: quote.instrumentKey,
                symbol: quote.symbol,
                key: quote.instrumentKey,
                price: quote.price,
                close: quote.close,
                timestamp: quote.timestamp,
            });
        }

        return snapshot;
    }

    /**
     * Build symbol/token maps from the in-memory repository.
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
            await instrumentRepository.ensureInitialized();

            this.isinMap.clear();
            this.reverseIsinMap.clear();

            let count = 0;
            for (const instr of instrumentRepository.getAll()) {
                count += 1;
                this.isinMap.set(instr.tradingsymbol, instr.instrumentToken);

                const parts = instr.instrumentToken.split("|");
                if (parts.length === 2) {
                    const isin = parts[1];
                    this.reverseIsinMap.set(isin, instr.tradingsymbol);
                } else {
                    this.reverseIsinMap.set(instr.instrumentToken, instr.tradingsymbol);
                }
            }

            logger.info({ count }, "Instruments loaded & mapped");
        } catch (error) {
            logger.error({ err: error }, "Failed to load instruments map");
        }
    }
}

// ═══════════════════════════════════════════════════════════
// 🛠️ EXPORT SINGLETON INSTANCE (not class)
// ═══════════════════════════════════════════════════════════
export const realTimeMarketService = RealTimeMarketService.getInstance();
