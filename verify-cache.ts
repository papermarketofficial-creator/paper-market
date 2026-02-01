import 'dotenv/config';
import { UpstoxService } from "./services/upstox.service";
import { cache } from "./lib/cache";

async function verifyCache() {
    console.log("🚀 Starting Cache Verification...");

    const symbol = "NSE_EQ|INE002A01018"; // RELIANCE
    const unit = "minutes";
    const interval = "1";
    const today = new Date().toISOString().split('T')[0];
    // Yesterday
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    console.log(`\nPARAMS: ${symbol} ${unit} ${interval} ${yesterday} -> ${today}\n`);

    // 1. First Call - Should be MISS
    console.log("👉 1. Requesting Data (Expected: MISS -> API Call)");
    const start1 = Date.now();
    const data1 = await UpstoxService.getHistoricalCandleData(symbol, unit, interval, yesterday, today);
    const end1 = Date.now();
    console.log(`   Result: ${data1.length} candles in ${end1 - start1}ms`);

    // 2. Second Call - Should be HIT
    console.log("\n👉 2. Requesting Same Data (Expected: HIT -> Cache)");
    const start2 = Date.now();
    const data2 = await UpstoxService.getHistoricalCandleData(symbol, unit, interval, yesterday, today);
    const end2 = Date.now();
    console.log(`   Result: ${data2.length} candles in ${end2 - start2}ms`);

    if (end2 - start2 < 50) {
        console.log("\n✅ SUCCESS: Second call was instant (<50ms). Cache is working.");
    } else {
        console.log("\n⚠️ WARNING: Second call took too long. Check logs.");
    }

    // 3. Verify Cache Keys
    console.log("\n👉 3. Inspecting Cache Implementation:");
    // Access internal cache storage if possible, or just rely on timing
    // LRU Cache doesn't expose keys() easily in all versions, depends on version installed
    // But we wrapped it in lib/cache.ts, let's try to verify via behavior
    
    process.exit(0);
}

verifyCache();
