// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { InstrumentService } from "@/services/instrument.service";
import { logger } from "@/lib/logger";
import type { NewInstrument } from "@/lib/db/schema";

/**
 * Seed instruments from Upstox master instruments file.
 * 
 * Upstox provides a daily updated CSV file with all instruments.
 * URL: https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz
 * 
 * For this demo, we'll create mock instruments for testing.
 * In production, you would download and parse the actual CSV.
 */

async function seedInstruments() {
    try {
        logger.info("Starting instruments seeding...");

        // Mock instruments for testing
        // In production, download from: https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz
        const mockInstruments: NewInstrument[] = [
            // NIFTY Index
            {
                instrumentToken: "NSE_INDEX|Nifty 50",
                exchangeToken: "Nifty 50",
                tradingsymbol: "NIFTY",
                name: "NIFTY 50",
                lastPrice: "21500.00",
                expiry: null,
                strike: null,
                tickSize: "0.05",
                lotSize: 50,
                instrumentType: "INDEX",
                segment: "NSE_EQ",
                exchange: "NSE",
                isActive: true,
            },
            // NIFTY Futures
            {
                instrumentToken: "NSE_FO|NIFTY24FEB",
                exchangeToken: "NIFTY24FEB",
                tradingsymbol: "NIFTY24FEB",
                name: "NIFTY FEB 2024 FUT",
                lastPrice: "21550.00",
                expiry: new Date("2024-02-29"),
                strike: null,
                tickSize: "0.05",
                lotSize: 50,
                instrumentType: "FUTURE",
                segment: "NSE_FO",
                exchange: "NSE",
                isActive: true,
            },
            // NIFTY Call Options
            {
                instrumentToken: "NSE_FO|NIFTY24FEB21500CE",
                exchangeToken: "NIFTY24FEB21500CE",
                tradingsymbol: "NIFTY24FEB21500CE",
                name: "NIFTY FEB 21500 CE",
                lastPrice: "120.50",
                expiry: new Date("2024-02-29"),
                strike: "21500.00",
                tickSize: "0.05",
                lotSize: 50,
                instrumentType: "OPTION",
                segment: "NSE_FO",
                exchange: "NSE",
                isActive: true,
            },
            {
                instrumentToken: "NSE_FO|NIFTY24FEB21600CE",
                exchangeToken: "NIFTY24FEB21600CE",
                tradingsymbol: "NIFTY24FEB21600CE",
                name: "NIFTY FEB 21600 CE",
                lastPrice: "85.25",
                expiry: new Date("2024-02-29"),
                strike: "21600.00",
                tickSize: "0.05",
                lotSize: 50,
                instrumentType: "OPTION",
                segment: "NSE_FO",
                exchange: "NSE",
                isActive: true,
            },
            // NIFTY Put Options
            {
                instrumentToken: "NSE_FO|NIFTY24FEB21500PE",
                exchangeToken: "NIFTY24FEB21500PE",
                tradingsymbol: "NIFTY24FEB21500PE",
                name: "NIFTY FEB 21500 PE",
                lastPrice: "98.75",
                expiry: new Date("2024-02-29"),
                strike: "21500.00",
                tickSize: "0.05",
                lotSize: 50,
                instrumentType: "OPTION",
                segment: "NSE_FO",
                exchange: "NSE",
                isActive: true,
            },
            {
                instrumentToken: "NSE_FO|NIFTY24FEB21400PE",
                exchangeToken: "NIFTY24FEB21400PE",
                tradingsymbol: "NIFTY24FEB21400PE",
                name: "NIFTY FEB 21400 PE",
                lastPrice: "65.50",
                expiry: new Date("2024-02-29"),
                strike: "21400.00",
                tickSize: "0.05",
                lotSize: 50,
                instrumentType: "OPTION",
                segment: "NSE_FO",
                exchange: "NSE",
                isActive: true,
            },
            // Equity stocks
            {
                instrumentToken: "NSE_EQ|RELIANCE",
                exchangeToken: "RELIANCE",
                tradingsymbol: "RELIANCE",
                name: "Reliance Industries Ltd",
                lastPrice: "2456.30",
                expiry: null,
                strike: null,
                tickSize: "0.05",
                lotSize: 1,
                instrumentType: "EQUITY",
                segment: "NSE_EQ",
                exchange: "NSE",
                isActive: true,
            },
            {
                instrumentToken: "NSE_EQ|TCS",
                exchangeToken: "TCS",
                tradingsymbol: "TCS",
                name: "Tata Consultancy Services Ltd",
                lastPrice: "3678.90",
                expiry: null,
                strike: null,
                tickSize: "0.05",
                lotSize: 1,
                instrumentType: "EQUITY",
                segment: "NSE_EQ",
                exchange: "NSE",
                isActive: true,
            },
            {
                instrumentToken: "NSE_EQ|INFY",
                exchangeToken: "INFY",
                tradingsymbol: "INFY",
                name: "Infosys Ltd",
                lastPrice: "1543.25",
                expiry: null,
                strike: null,
                tickSize: "0.05",
                lotSize: 1,
                instrumentType: "EQUITY",
                segment: "NSE_EQ",
                exchange: "NSE",
                isActive: true,
            },
            {
                instrumentToken: "NSE_EQ|HDFCBANK",
                exchangeToken: "HDFCBANK",
                tradingsymbol: "HDFCBANK",
                name: "HDFC Bank Ltd",
                lastPrice: "1632.45",
                expiry: null,
                strike: null,
                tickSize: "0.05",
                lotSize: 1,
                instrumentType: "EQUITY",
                segment: "NSE_EQ",
                exchange: "NSE",
                isActive: true,
            },
        ];

        logger.info({ count: mockInstruments.length }, "Inserting instruments...");

        // Use InstrumentService to bulk insert
        const result = await InstrumentService.bulkUpsert(mockInstruments);

        logger.info({ count: result.count }, "✓ Instruments seeded successfully!");

        logger.info("Seeding complete. You can now:");
        logger.info("1. Start the jobs: npx tsx --env-file=.env.local scripts/start-jobs.ts");
        logger.info("2. Place orders via API");
        logger.info("3. Watch orders execute automatically");

        process.exit(0);
    } catch (error) {
        logger.error({ err: error }, "Failed to seed instruments");
        process.exit(1);
    }
}

seedInstruments();
