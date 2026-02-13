import { db } from "@/lib/db";
import { instruments, InstrumentType } from "@/lib/db/schema";
import { and, eq, ilike, gte, asc } from "drizzle-orm";
import { marketSimulation } from "@/services/market-simulation.service";
import { OptionChainInput } from "@/lib/validation/option-chain";
import { UpstoxService } from "@/services/upstox.service";

export class OptionChainService {
    static async getOptionChain(input: OptionChainInput) {
        const { symbol } = input;

        // 1. Fetch all options for the underlying symbol
        // We assume symbol prefix match e.g. "NIFTY%"
        const options = await db
            .select()
            .from(instruments)
            .where(
                and(
                    ilike(instruments.tradingsymbol, `${symbol}%`),
                    eq(instruments.instrumentType, InstrumentType.OPTION),
                    eq(instruments.isActive, true)
                )
            )
            .orderBy(asc(instruments.expiry), asc(instruments.strike));

        if (options.length === 0) {
            return { underlying: symbol, strikes: [] };
        }

        // 2. Determine Expiry
        // If input.expiry is null, pick the nearest one from the results
        let targetExpiry = input.expiry;
        if (!targetExpiry) {
            // Find nearest unique expiry
            const expiries = Array.from(new Set(options.map(o => o.expiry?.toISOString()))).sort();
            if (expiries.length > 0) targetExpiry = expiries[0];
        }

        if (!targetExpiry) return { underlying: symbol, strikes: [] };

        // 3. Filter by Expiry
        const chainOptions = options.filter(o => o.expiry?.toISOString() === targetExpiry);

        const tokenQuotes = await UpstoxService.getSystemQuotes(
            chainOptions.map((opt) => opt.instrumentToken)
        );

        // 4. Group by Strike
        const strikeMap = new Map<number, { strike: number, ce?: any, pe?: any }>();

        for (const opt of chainOptions) {
            const strike = parseFloat(opt.strike || "0");
            if (strike === 0) continue;

            if (!strikeMap.has(strike)) {
                strikeMap.set(strike, { strike });
            }

            const entry = strikeMap.get(strike)!;

            // Get Real-time Price
            const quote = marketSimulation.getQuote(opt.tradingsymbol);
            const ltpFromUpstox =
                Number(tokenQuotes[opt.instrumentToken]) ||
                Number(tokenQuotes[opt.instrumentToken.replace("|", ":")]) ||
                0;
            const ltp =
                quote?.price ||
                (Number.isFinite(ltpFromUpstox) && ltpFromUpstox > 0 ? ltpFromUpstox : 0);

            // Parse Type (CE/PE) - crude check
            const isCE = opt.tradingsymbol.endsWith("CE");
            const isPE = opt.tradingsymbol.endsWith("PE");

            const data = {
                symbol: opt.tradingsymbol,
                ltp: ltp,
                oi: 0, // Mock for now
                volume: 0, // Mock for now
                iv: 0, // Mock for now
                lotSize: opt.lotSize
            };

            if (isCE) entry.ce = data;
            if (isPE) entry.pe = data;
        }

        // 5. Convert to Array and Sort
        const strikes = Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);

        return {
            underlying: symbol,
            expiry: targetExpiry,
            strikes
        };
    }
}
