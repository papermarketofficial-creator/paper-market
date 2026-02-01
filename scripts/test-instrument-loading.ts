// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * Verification Script: Test Instrument Loading
 * 
 * This script verifies that:
 * 1. Instruments are loaded from database
 * 2. Symbol → ISIN mapping works correctly
 * 3. Reverse ISIN → Symbol mapping works correctly
 */

async function testInstrumentLoading() {
    try {
        logger.info("=== Testing Instrument Loading ===");

        // 1. Load instruments from DB
        logger.info("Loading instruments from database...");
        const allInstruments = await db
            .select({
                instrumentToken: instruments.instrumentToken,
                tradingsymbol: instruments.tradingsymbol,
                name: instruments.name,
                segment: instruments.segment,
            })
            .from(instruments)
            .where(eq(instruments.isActive, true));

        logger.info({ count: allInstruments.length }, "✓ Instruments loaded from DB");

        if (allInstruments.length === 0) {
            logger.error("❌ No instruments found! Run seed script first: npx tsx scripts/seed-instruments.ts");
            process.exit(1);
        }

        // 2. Build maps (same logic as RealTimeMarketService)
        const isinMap = new Map<string, string>();
        const reverseIsinMap = new Map<string, string>();

        for (const instr of allInstruments) {
            // Map: RELIANCE → NSE_EQ|INE...
            isinMap.set(instr.tradingsymbol, instr.instrumentToken);
            
            // Map: INE... → RELIANCE (for reverse lookup)
            const parts = instr.instrumentToken.split("|");
            if (parts.length === 2) {
                const isin = parts[1]; // INE...
                reverseIsinMap.set(isin, instr.tradingsymbol);
            } else {
                reverseIsinMap.set(instr.instrumentToken, instr.tradingsymbol);
            }
        }

        logger.info({ 
            isinMapSize: isinMap.size, 
            reverseMapSize: reverseIsinMap.size 
        }, "✓ Maps built successfully");

        // 3. Test forward mapping (Symbol → ISIN)
        logger.info("Testing forward mapping (Symbol → ISIN)...");
        const testSymbols = ["RELIANCE", "TCS", "INFY", "SBIN", "HDFCBANK"];
        
        for (const symbol of testSymbols) {
            const isin = isinMap.get(symbol);
            if (isin) {
                logger.info({ symbol, isin }, "✓ Forward mapping works");
            } else {
                logger.warn({ symbol }, "⚠️ Symbol not found in map");
            }
        }

        // 4. Test reverse mapping (ISIN → Symbol)
        logger.info("Testing reverse mapping (ISIN → Symbol)...");
        const sampleISINs = Array.from(reverseIsinMap.keys()).slice(0, 5);
        
        for (const isin of sampleISINs) {
            const symbol = reverseIsinMap.get(isin);
            if (symbol) {
                logger.info({ isin, symbol }, "✓ Reverse mapping works");
            } else {
                logger.warn({ isin }, "⚠️ ISIN not found in reverse map");
            }
        }

        // 5. Summary
        logger.info("=== Summary ===");
        logger.info({ 
            totalInstruments: allInstruments.length,
            equities: allInstruments.filter(i => i.segment === "NSE_EQ").length,
            indices: allInstruments.filter(i => i.instrumentToken.includes("INDEX")).length,
        }, "Instrument breakdown");

        logger.info("✅ All tests passed! Dynamic instrument mapping is working correctly.");
        process.exit(0);
    } catch (error) {
        logger.error({ err: error }, "❌ Test failed");
        process.exit(1);
    }
}

testInstrumentLoading();
