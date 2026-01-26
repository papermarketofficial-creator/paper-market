import { config } from "dotenv";
import fs from "fs";
import path from "path";

// 1. Force load .env.local before anything else
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
    config({ path: envPath });
    console.log("✅ Loaded .env.local");
} else {
    console.error("❌ .env.local not found at", envPath);
    process.exit(1);
}

// 2. Dynamic Import Application Code
async function main() {
    const { SearchService } = await import("@/services/search.service");
    const { InstrumentType } = await import("@/lib/db/schema");

    console.log("🔍 Testing Search API...");

    // 1. Search for Equity 'REL'
    console.log("\n1. Searching for 'REL' (Equity)...");
    const relResults = await SearchService.searchInstruments({
        q: "REL",
        type: "EQUITY",
        limit: 5
    });
    console.table(relResults.map((r: any) => ({ symbol: r.symbol, name: r.name, type: r.type })));

    if (relResults.length > 0 && relResults[0].symbol.includes("REL")) {
        console.log("✅ Equity search passed");
    } else {
        console.log("⚠️ Equity search returned 0 results (Check seeder data)");
    }

    // 2. Search for NIFTY Options
    console.log("\n2. Searching for 'NIFTY' (Options)...");
    const optResults = await SearchService.searchInstruments({
        q: "NIFTY",
        type: "OPTIONS",
        limit: 5
    });
    console.table(optResults.map((r: any) => ({ symbol: r.symbol, expiry: r.expiry, strike: r.strike })));

    if (optResults.length > 0 && optResults[0].type === InstrumentType.OPTION) {
        console.log("✅ Option search passed");
    } else {
        console.log("⚠️ Option search returned 0 results");
    }

    process.exit(0);
}

main().catch(console.error);
