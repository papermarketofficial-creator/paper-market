// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import { like } from "drizzle-orm";
import { logger } from "@/lib/logger";

async function checkInvalidTokens() {
    try {
        logger.info("Checking for invalid ISINs...");
        
        // Check for mock ISINs (which likely have 'XXXXXX' padding from my previous script)
        const invalid = await db.select({
            symbol: instruments.tradingsymbol,
            token: instruments.instrumentToken
        })
        .from(instruments)
        .where(like(instruments.instrumentToken, "%XXXXXX%")); // Pattern used in add-missing-instruments.ts
        
        if (invalid.length > 0) {
            logger.warn({ count: invalid.length, examples: invalid.slice(0, 3) }, "⚠️ Found potentially invalid ISINs");
        } else {
            logger.info("✅ No obvious mock ISINs found.");
        }

        // Count total
        const all = await db.select().from(instruments);
        logger.info({ total: all.length }, "Total instruments in DB");

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkInvalidTokens();
