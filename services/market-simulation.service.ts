import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { UpstoxService } from "@/services/upstox.service";

interface PriceData {
    price: number;
    lastUpdated: Date;
}

interface Quote {
    symbol: string;
    price: number;
    lastUpdated: Date;
}

class MarketSimulationService {
    private prices: Map<string, PriceData> = new Map();
    private initialized: boolean = false;

    /**
     * Initialize the simulation with prices from the database.
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            logger.warn("MarketSimulationService already initialized");
            return;
        }

        try {
            const activeInstruments = await db
                .select({
                    tradingsymbol: instruments.tradingsymbol,
                    instrumentToken: instruments.instrumentToken,
                })
                .from(instruments)
                .where(eq(instruments.isActive, true));

            const tokens = activeInstruments.map((instrument) => instrument.instrumentToken);
            const quoteMap = await UpstoxService.getSystemQuotes(tokens);

            for (const instrument of activeInstruments) {
                const direct = Number(quoteMap[instrument.instrumentToken]);
                const alt = Number(quoteMap[instrument.instrumentToken.replace("|", ":")]);
                const price = Number.isFinite(direct) && direct > 0
                    ? direct
                    : Number.isFinite(alt) && alt > 0
                        ? alt
                        : 0;
                if (!isNaN(price) && price > 0) {
                    this.prices.set(instrument.tradingsymbol, {
                        price,
                        lastUpdated: new Date(),
                    });
                }
            }

            this.initialized = true;
            logger.info(
                { count: this.prices.size },
                "MarketSimulationService initialized"
            );
        } catch (error) {
            logger.error({ err: error }, "Failed to initialize MarketSimulationService");
            throw error;
        }
    }

    /**
     * Simulate a single tick for all instruments.
     */
    tick(): void {
        if (!this.initialized) {
            logger.warn("Cannot tick: MarketSimulationService not initialized");
            return;
        }

        const now = new Date();
        let updateCount = 0;

        for (const [symbol, priceData] of this.prices.entries()) {
            const volatility = this.getVolatility(symbol);
            const change = this.randomWalk(volatility);
            const newPrice = Math.max(0.05, priceData.price * (1 + change));

            // Round to 2 decimal places
            this.prices.set(symbol, {
                price: Math.round(newPrice * 100) / 100,
                lastUpdated: now,
            });

            updateCount++;
        }

        logger.debug({ updateCount }, "Market tick executed");
    }

    /**
     * Get quote for a specific symbol.
     */
    getQuote(symbol: string): Quote | null {
        const priceData = this.prices.get(symbol.toUpperCase());
        if (!priceData) {
            return null;
        }

        return {
            symbol: symbol.toUpperCase(),
            price: priceData.price,
            lastUpdated: priceData.lastUpdated,
        };
    }

    /**
     * Get all quotes as a simple record.
     */
    getAllQuotes(): Record<string, number> {
        const quotes: Record<string, number> = {};
        for (const [symbol, priceData] of this.prices.entries()) {
            quotes[symbol] = priceData.price;
        }
        return quotes;
    }

    /**
     * Get count of tracked symbols.
     */
    getSymbolCount(): number {
        return this.prices.size;
    }

    /**
     * Manually set a price.
     */
    setPrice(symbol: string, price: number): void {
        if (price < 0.05) {
            logger.warn({ symbol, price }, "Price below minimum, setting to 0.05");
            price = 0.05;
        }

        this.prices.set(symbol.toUpperCase(), {
            price: Math.round(price * 100) / 100,
            lastUpdated: new Date(),
        });
    }

    /**
     * Reset the service.
     */
    reset(): void {
        this.prices.clear();
        this.initialized = false;
        logger.info("MarketSimulationService reset");
    }

    /**
     * Determine volatility based on instrument type.
     */
    private getVolatility(symbol: string): number {
        if (symbol.includes("CE") || symbol.includes("PE")) {
            return 0.015; // 1.5% for options
        }
        return 0.005; // 0.5% for futures/equity
    }

    /**
     * Generate a random walk change using Box-Muller transform.
     */
    private randomWalk(volatility: number): number {
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return z0 * volatility;
    }
}

// Singleton instance
declare global {
    var __marketSimulationServiceInstance: MarketSimulationService | undefined;
}

const globalState = globalThis as unknown as {
    __marketSimulationServiceInstance?: MarketSimulationService;
};

export const marketSimulation =
    globalState.__marketSimulationServiceInstance || new MarketSimulationService();

globalState.__marketSimulationServiceInstance = marketSimulation;
