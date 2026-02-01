// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import type { NewInstrument } from "@/lib/db/schema";
import { TRADING_UNIVERSE } from "@/lib/trading-universe";
import { logger } from "@/lib/logger";

/**
 * Safe Migration: Add Missing Instruments from Trading Universe
 * 
 * This script:
 * 1. Reads existing instruments from DB
 * 2. Identifies missing symbols from TRADING_UNIVERSE
 * 3. Adds them with mock ISIN codes (for now)
 * 4. Does NOT break existing orders/positions
 */

// Mock ISIN mapping for common stocks (real ISINs from NSE)
const KNOWN_ISINS: Record<string, string> = {
    // Banking
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
    
    // Infra
    "LT": "INE018A01030",
    "ADANIPORTS": "INE742F01042",
    "ULTRACEMCO": "INE481G01011",
    "POWERGRID": "INE752E01010",
};

async function addMissingInstruments() {
    try {
        logger.info("=== Safe Instrument Migration ===");
        
        // 1. Get existing instruments
        const existing = await db.select({
            tradingsymbol: instruments.tradingsymbol,
        }).from(instruments);
        
        const existingSymbols = new Set(existing.map(i => i.tradingsymbol));
        logger.info({ count: existingSymbols.size }, "Existing instruments in DB");
        
        // 2. Find missing symbols
        const allSymbols = TRADING_UNIVERSE.equities;
        const missingSymbols = allSymbols.filter(s => !existingSymbols.has(s));
        
        logger.info({ 
            total: allSymbols.length, 
            existing: existingSymbols.size,
            missing: missingSymbols.length 
        }, "Symbol analysis");
        
        if (missingSymbols.length === 0) {
            logger.info("✅ All symbols already in database!");
            process.exit(0);
        }
        
        // 3. Create instrument records for missing symbols
        const newInstruments: NewInstrument[] = [];
        
        for (const symbol of missingSymbols) {
            const isin = KNOWN_ISINS[symbol] || `INE${symbol.slice(0, 6).padEnd(6, 'X')}01`;
            
            newInstruments.push({
                instrumentToken: `NSE_EQ|${isin}`,
                exchangeToken: isin,
                tradingsymbol: symbol,
                name: symbol, // Will be updated later with real names
                lastPrice: "0.00",
                expiry: null,
                strike: null,
                tickSize: "0.05",
                lotSize: 1,
                instrumentType: "EQUITY",
                segment: "NSE_EQ",
                exchange: "NSE",
                isActive: true,
            });
        }
        
        // 4. Also add indices if missing
        const indices = [
            {
                instrumentToken: "NSE_INDEX|Nifty 50",
                exchangeToken: "Nifty 50",
                tradingsymbol: "NIFTY 50",
                name: "NIFTY 50",
                lastPrice: "0.00",
                expiry: null,
                strike: null,
                tickSize: "0.05",
                lotSize: 50,
                instrumentType: "INDEX",
                segment: "NSE_EQ",
                exchange: "NSE",
                isActive: true,
            },
            {
                instrumentToken: "NSE_INDEX|Nifty Bank",
                exchangeToken: "Nifty Bank",
                tradingsymbol: "NIFTY BANK",
                name: "NIFTY BANK",
                lastPrice: "0.00",
                expiry: null,
                strike: null,
                tickSize: "0.05",
                lotSize: 25,
                instrumentType: "INDEX",
                segment: "NSE_EQ",
                exchange: "NSE",
                isActive: true,
            },
            {
                instrumentToken: "NSE_INDEX|Nifty Fin Service",
                exchangeToken: "Nifty Fin Service",
                tradingsymbol: "NIFTY FIN SERVICE",
                name: "NIFTY FIN SERVICE",
                lastPrice: "0.00",
                expiry: null,
                strike: null,
                tickSize: "0.05",
                lotSize: 40,
                instrumentType: "INDEX",
                segment: "NSE_EQ",
                exchange: "NSE",
                isActive: true,
            },
        ];
        
        // Check which indices are missing
        for (const index of indices) {
            if (!existingSymbols.has(index.tradingsymbol)) {
                newInstruments.push(index);
            }
        }
        
        logger.info({ count: newInstruments.length }, "Instruments to add");
        
        // 5. Insert in batches
        if (newInstruments.length > 0) {
            await db.insert(instruments).values(newInstruments);
            logger.info({ count: newInstruments.length }, "✅ Instruments added successfully!");
            
            // Log added symbols
            logger.info("Added symbols:");
            newInstruments.forEach(i => {
                logger.info(`  - ${i.tradingsymbol} (${i.instrumentToken})`);
            });
        }
        
        // 6. Verify final count
        const final = await db.select().from(instruments);
        logger.info({ total: final.length }, "Total instruments in database");
        
        logger.info("=== Migration Complete ===");
        logger.info("✅ Safe to restart application");
        logger.info("✅ RealTimeMarketService will load all instruments dynamically");
        
        process.exit(0);
    } catch (error) {
        logger.error({ err: error }, "❌ Migration failed");
        process.exit(1);
    }
}

addMissingInstruments();
