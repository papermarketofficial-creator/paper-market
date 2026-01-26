import { config } from "dotenv";
import fs from "fs";
import path from "path";

// 1. Force load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
    config({ path: envPath });
    console.log("✅ Loaded .env.local");
} else {
    console.error("❌ .env.local not found at", envPath);
    process.exit(1);
}

// 2. Dynamic Imports
async function main() {
    const { OptionChainService } = await import("@/services/option-chain.service");
    const { marketSimulation } = await import("@/services/market-simulation.service");

    console.log("🔗 Testing Option Chain API...");

    // Initialize Simulation to get prices
    await marketSimulation.initialize();

    // Test NIFTY Chain
    console.log("\n1. Fetching Option Chain for 'NIFTY'...");
    const chain = await OptionChainService.getOptionChain({ symbol: "NIFTY" });

    console.log(`Underlying: ${chain.underlying}`);
    console.log(`Expiry: ${chain.expiry || "None found"}`);
    console.log(`Strikes: ${chain.strikes.length}`);

    if (chain.strikes.length > 0) {
        console.log("\nSample Strikes:");
        console.table(chain.strikes.slice(0, 5).map(s => ({
            strike: s.strike,
            ce_symbol: s.ce?.symbol || '-',
            ce_ltp: s.ce?.ltp || 0,
            pe_symbol: s.pe?.symbol || '-',
            pe_ltp: s.pe?.ltp || 0
        })));
        console.log("✅ Option Chain data structure looks correct.");
    } else {
        console.warn("⚠️ No strikes found. Check if options are seeded in DB for 'NIFTY'.");
    }

    process.exit(0);
}

main().catch(console.error);
