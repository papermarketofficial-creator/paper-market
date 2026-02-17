/**
 * Process-level singleton LRU cache for instrument lookups.
 * Avoids repeated DB hits across OrderService, ExecutionService, MarginService, PositionService.
 * 
 * Instruments change at most daily (during sync), so a 60-second TTL is safe.
 */

import { db } from '@/lib/db';
import { instruments } from '@/lib/db/schema/market.schema';
import { eq } from 'drizzle-orm';
import type { Instrument } from '@/lib/db/schema/market.schema';

interface CacheEntry {
    instrument: Instrument;
    expiresAt: number;
}

class InstrumentCache {
    private static instance: InstrumentCache;
    private cache = new Map<string, CacheEntry>();
    private readonly TTL_MS = 60 * 1000; // 60 seconds

    private constructor() {}

    static getInstance(): InstrumentCache {
        if (!InstrumentCache.instance) {
            InstrumentCache.instance = new InstrumentCache();
        }
        return InstrumentCache.instance;
    }

    /**
     * Get instrument by token (primary key lookup)
     */
    async getByToken(token: string): Promise<Instrument | null> {
        const cached = this.cache.get(`token:${token}`);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.instrument;
        }

        const result = await db
            .select()
            .from(instruments)
            .where(eq(instruments.instrumentToken, token))
            .limit(1);

        if (result.length === 0) return null;

        const instrument = result[0];
        this.cache.set(`token:${token}`, {
            instrument,
            expiresAt: Date.now() + this.TTL_MS,
        });

        return instrument;
    }

    /**
     * Get instrument by trading symbol (non-unique, returns first match)
     * For F&O, this may return ambiguous results. Prefer getByToken when possible.
     */
    async getBySymbol(symbol: string): Promise<Instrument | null> {
        const cached = this.cache.get(`symbol:${symbol}`);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.instrument;
        }

        const result = await db
            .select()
            .from(instruments)
            .where(eq(instruments.tradingsymbol, symbol))
            .limit(1);

        if (result.length === 0) return null;

        const instrument = result[0];
        this.cache.set(`symbol:${symbol}`, {
            instrument,
            expiresAt: Date.now() + this.TTL_MS,
        });

        return instrument;
    }

    /**
     * Invalidate all cached entries (call after instrument sync)
     */
    invalidate(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics (for monitoring)
     */
    getStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
                key,
                expiresIn: Math.max(0, entry.expiresAt - Date.now()),
            })),
        };
    }
}

// Export singleton instance
export const instrumentCache = InstrumentCache.getInstance();
