// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { InstrumentService } from "@/services/instrument.service";
import { UpstoxService } from "@/services/upstox.service";
import { logger } from "@/lib/logger";
import type { NewInstrument } from "@/lib/db/schema";
import { TRADING_UNIVERSE } from "@/lib/trading-universe";

/**
 * Seed instruments from Trading Universe configuration.
 * 
 * This script:
 * 1. Reads symbols from TRADING_UNIVERSE
 * 2. Fetches instrument details from Upstox API
 * 3. Inserts them into the database
 */

async function seedInstruments() {
    try {
        logger.info("Starting instruments seeding from Trading Universe...");

        const instruments: NewInstrument[] = [];
        const allSymbols = [...TRADING_UNIVERSE.equities];
        
        logger.info({ count: allSymbols.length }, "Symbols to fetch from Trading Universe");

        // Fetch instrument details from Upstox for each symbol
        // Note: This requires a valid Upstox token
        for (const symbol of allSymbols) {
            try {
                logger.info({ symbol }, "Fetching instrument details...");
                
                // Search for the instrument using Upstox API
                const searchResults = await UpstoxService.searchInstruments(symbol, "equity");
                
                if (searchResults.length === 0) {
                    logger.warn({ symbol }, "No instrument found, skipping");
                    continue;
                }

                // Find exact match (prefer NSE_EQ)
                const match = searchResults.find(
                    (r: any) => 
                        r.tradingsymbol === symbol && 
                        r.exchange === "NSE" && 
                        r.segment === "NSE_EQ"
                ) || searchResults[0];

                if (!match) {
                    logger.warn({ symbol }, "No NSE_EQ match found, skipping");
                    continue;
                }

                // Create instrument record
                const instrument: NewInstrument = {
                    instrumentToken: match.instrument_key || `NSE_EQ|${symbol}`,
                    exchangeToken: match.exchange_token || symbol,
                    tradingsymbol: symbol,
                    name: match.name || symbol,
                    expiry: null,
                    strike: null,
                    tickSize: "0.05",
                    lotSize: match.lot_size || 1,
                    instrumentType: "EQUITY",
                    segment: "NSE_EQ",
                    exchange: "NSE",
                    isActive: true,
                };

                instruments.push(instrument);
                logger.info({ symbol, instrumentToken: instrument.instrumentToken }, "✓ Instrument prepared");

                // Rate limiting: wait 100ms between API calls
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                logger.error({ err: error, symbol }, "Failed to fetch instrument, skipping");
                continue;
            }
        }

        // Also add indices
        logger.info("Adding indices...");
        const indexInstruments: NewInstrument[] = [
            {
                instrumentToken: "NSE_INDEX|Nifty 50",
                exchangeToken: "Nifty 50",
                tradingsymbol: "NIFTY 50",
                name: "NIFTY 50",
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

        instruments.push(...indexInstruments);

        logger.info({ count: instruments.length }, "Inserting instruments into database...");

        // Use InstrumentService to bulk insert
        const result = await InstrumentService.bulkUpsert(instruments);

        logger.info({ count: result.count }, "✓ Instruments seeded successfully!");
        logger.info({ total: instruments.length, success: result.count }, "Seeding summary");

        logger.info("Seeding complete. The RealTimeMarketService will now load these instruments dynamically.");

        process.exit(0);
    } catch (error) {
        logger.error({ err: error }, "Failed to seed instruments");
        process.exit(1);
    }
}

seedInstruments();
