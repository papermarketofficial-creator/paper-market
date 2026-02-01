import { db } from "@/lib/db";
import { instruments, InstrumentType } from "@/lib/db/schema";
import { ilike, or, and, eq, desc, inArray } from "drizzle-orm";
import { InstrumentSearchInput } from "@/lib/validation/search";
import { TRADING_UNIVERSE } from "@/lib/trading-universe";

export class SearchService {
    static async searchInstruments(input: InstrumentSearchInput) {
        const { q, type, limit } = input;
        const searchTerm = `%${q}%`;

        // Combine all allowed names
        const allowedNames = [...TRADING_UNIVERSE.indices, ...TRADING_UNIVERSE.equities];

        const whereConditions = [
            or(
                ilike(instruments.tradingsymbol, searchTerm),
                ilike(instruments.name, searchTerm)
            ),
            eq(instruments.isActive, true),
            inArray(instruments.name, allowedNames) // Enforce Universe
        ];

        if (type) {
            // Map frontend "FUTURES" / "OPTIONS" to DB "FUTURE" / "OPTION"
            let dbType = type as string;
            if (type === 'FUTURES') dbType = InstrumentType.FUTURE;
            if (type === 'OPTIONS') dbType = InstrumentType.OPTION;

            whereConditions.push(eq(instruments.instrumentType, dbType));
        }

        const results = await db
            .select({
                token: instruments.instrumentToken,
                symbol: instruments.tradingsymbol,
                name: instruments.name,
                type: instruments.instrumentType,
                expiry: instruments.expiry,
                strike: instruments.strike,
                lotSize: instruments.lotSize,
                exchange: instruments.exchange,
                lastPrice: instruments.lastPrice
            })
            .from(instruments)
            .where(and(...whereConditions))
            .limit(limit)
            .orderBy(desc(instruments.expiry)); // Show nearest expiry or relevant sorting

        return results;
    }
}
