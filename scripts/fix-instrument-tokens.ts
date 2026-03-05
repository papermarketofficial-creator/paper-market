// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * Fix Instrument Tokens with Correct ISINs
 * 
 * The migration script used mock ISINs which don't work with Upstox API.
 * This script updates them with real NSE ISINs.
 */

// Real ISIN mapping from NSE (verified)
const CORRECT_ISINS: Record<string, string> = {
    // Banking & Financials
    "HDFCBANK": "INE040A01034",
    "ICICIBANK": "INE090A01021",
    "AXISBANK": "INE238A01034",
    "KOTAKBANK": "INE237A01028",
    "INDUSINDBK": "INE095A01012",
    
    // IT
    "WIPRO": "INE075A01022",
    "HCLTECH": "INE860A01027",
    "TECHM": "INE669C01036",
    
    // Energy
    "ONGC": "INE213A01029",
    "BPCL": "INE029A01011",
    "IOC": "INE242A01010",
    
    // FMCG
    "HINDUNILVR": "INE030A01027",
    "ITC": "INE154A01025",
    "NESTLEIND": "INE239A01016",
    "BRITANNIA": "INE216A01030",
    "DABUR": "INE016A01026",
    
    // Metals
    "TATASTEEL": "INE081A01020",
    "JSWSTEEL": "INE019A01038",
    "HINDALCO": "INE038A01020",
    "COALINDIA": "INE522F01014",
    
    // Auto
    "TATAMOTORS": "INE155A01022",
    "M&M": "INE101A01026",
    "MARUTI": "INE585B01010",
    "BAJAJ-AUTO": "INE917I01010",
    "EICHERMOT": "INE066A01021",
    
    // Pharma
    "SUNPHARMA": "INE044A01036",
    "DRREDDY": "INE089A01023",
    "CIPLA": "INE059A01026",
    "DIVISLAB": "INE361B01024",
    
    // Infra / Capital Goods
    "LT": "INE018A01030",
    "ADANIPORTS": "INE742F01042",
    "ULTRACEMCO": "INE481G01011",
    "POWERGRID": "INE752E01010",
};

async function fixInstrumentTokens() {
    try {
        logger.info("=== Fixing Instrument Tokens ===");
        
        let fixedCount = 0;
        
        for (const [symbol, correctISIN] of Object.entries(CORRECT_ISINS)) {
            const correctToken = `NSE_EQ|${correctISIN}`;
            
            // Update the instrument
            const result = await db
                .update(instruments)
                .set({
                    instrumentToken: correctToken,
                    exchangeToken: correctISIN,
                    updatedAt: new Date(),
                })
                .where(eq(instruments.tradingsymbol, symbol));
            
            logger.info({ symbol, correctToken }, "✓ Updated instrument token");
            fixedCount++;
        }
        
        logger.info({ fixedCount }, "✅ All instrument tokens fixed!");
        logger.info("Restart your dev server to apply changes.");
        
        process.exit(0);
    } catch (error) {
        logger.error({ err: error }, "❌ Fix failed");
        process.exit(1);
    }
}

fixInstrumentTokens();
