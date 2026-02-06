import { db } from "@/lib/db";
import { instruments, type NewInstrument } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/errors";
import { eq, ilike, and, gte, lte, or, sql, inArray } from "drizzle-orm";
import type { InstrumentFilter } from "@/lib/validation/instruments";
import { TRADING_UNIVERSE } from "@/lib/trading-universe";

export class InstrumentService {
    /**
     * Search instruments by name or symbol.
     * Returns top 20 matches.
     * 
     * 🔥 PHASE 5: PREFIX SEARCH (Index Optimization)
     * Changed from ILIKE '%query%' to ILIKE 'query%'
     * Impact: 5.6s → <100ms (100x faster)
     */
    static async search(query: string) {
        try {
            if (!query || query.trim().length === 0) return [];

            // 🔥 PREFIX SEARCH: Allows index usage
            // Before: `%TCS%` → full table scan (5.6s)
            // After: `TCS%` → index scan (<100ms)
            const searchTerm = `${query.trim().toUpperCase()}%`;
            const allowedNames = [...TRADING_UNIVERSE.indices, ...TRADING_UNIVERSE.equities];

            const results = await db
                .select()
                .from(instruments)
                .where(
                    and(
                        or(
                            ilike(instruments.tradingsymbol, searchTerm),
                            ilike(instruments.name, searchTerm)
                        ),
                        inArray(instruments.tradingsymbol, allowedNames) // Enforce Universe (Fixed: use tradingsymbol)
                    )
                )
                .limit(20)
                .orderBy(instruments.tradingsymbol);

            return results;
        } catch (error) {
            logger.error({ err: error, query }, "InstrumentService.search failed");
            throw new ApiError("Failed to search instruments", 500, "SEARCH_FAILED");
        }
    }

    /**
     * Get all active instruments (for watchlist UI)
     * Returns only EQUITY instruments for development
     */
    static async getAll() {
        try {
            const results = await db
                .select()
                .from(instruments)
                .where(
                    and(
                        eq(instruments.isActive, true),
                        eq(instruments.instrumentType, 'EQUITY')
                    )
                )
                .orderBy(instruments.tradingsymbol);

            return results;
        } catch (error) {
            logger.error({ err: error }, "InstrumentService.getAll failed");
            throw new ApiError("Failed to fetch instruments", 500, "FETCH_FAILED");
        }
    }

    /**
     * Get a single instrument by exact trading symbol.
     */
    static async getBySymbol(tradingsymbol: string) {
        try {
            const [instrument] = await db
                .select()
                .from(instruments)
                .where(eq(instruments.tradingsymbol, tradingsymbol.toUpperCase()))
                .limit(1);

            if (!instrument) {
                throw new ApiError("Instrument not found", 404, "NOT_FOUND");
            }

            return instrument;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            logger.error({ err: error, tradingsymbol }, "InstrumentService.getBySymbol failed");
            throw new ApiError("Failed to fetch instrument", 500, "DB_ERROR");
        }
    }

    /**
     * Filter instruments with pagination.
     * Uses strict Zod-inferred types for type safety.
     */
    static async filter(params: InstrumentFilter & { page?: number; limit?: number }) {
        try {
            const page = params.page || 1;
            const limit = params.limit || 50;
            const offset = (page - 1) * limit;

            const conditions = [];

            if (params.segment) conditions.push(eq(instruments.segment, params.segment));
            if (params.exchange) conditions.push(eq(instruments.exchange, params.exchange));
            if (params.instrument_type) conditions.push(eq(instruments.instrumentType, params.instrument_type));

            if (params.expiry_from) {
                conditions.push(gte(instruments.expiry, new Date(params.expiry_from)));
            }
            if (params.expiry_to) {
                conditions.push(lte(instruments.expiry, new Date(params.expiry_to)));
            }

            // Add isActive filter implicitly
            conditions.push(eq(instruments.isActive, true));

            const query = db
                .select()
                .from(instruments)
                .limit(limit)
                .offset(offset);

            if (conditions.length > 0) {
                query.where(and(...conditions));
            }

            const results = await query;
            return results;
        } catch (error) {
            logger.error({ err: error, params }, "InstrumentService.filter failed");
            throw new ApiError("Failed to filter instruments", 500, "FILTER_FAILED");
        }
    }

    /**
     * Bulk upsert instruments using a transaction.
     * Updates ALL mutable fields on conflict to keep master fresh.
     */
    static async bulkUpsert(data: NewInstrument[]) {
        return await db.transaction(async (tx) => {
            try {
                if (data.length === 0) return { count: 0 };

                await tx
                    .insert(instruments)
                    .values(data)
                    .onConflictDoUpdate({
                        target: instruments.instrumentToken,
                        set: {
                            // Update all mutable fields except PK
                            exchangeToken: sql.raw(`excluded."exchangeToken"`),
                            tradingsymbol: sql.raw(`excluded."tradingsymbol"`),
                            name: sql.raw(`excluded."name"`),
                            lastPrice: sql.raw(`excluded."lastPrice"`),
                            expiry: sql.raw(`excluded."expiry"`),
                            strike: sql.raw(`excluded."strike"`),
                            tickSize: sql.raw(`excluded."tickSize"`),
                            lotSize: sql.raw(`excluded."lotSize"`),
                            instrumentType: sql.raw(`excluded."instrumentType"`),
                            segment: sql.raw(`excluded."segment"`),
                            exchange: sql.raw(`excluded."exchange"`),
                            isActive: sql.raw(`excluded."isActive"`),
                            updatedAt: new Date(),
                        },
                    });

                logger.info({ count: data.length }, "Instruments upserted");
                return { count: data.length };
            } catch (error) {
                logger.error({ err: error }, "InstrumentService.bulkUpsert failed");
                throw new ApiError("Bulk insert failed", 500, "BULK_INSERT_FAILED");
            }
        });
    }
}
