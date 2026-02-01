import 'dotenv/config';
import { realTimeMarketService } from "./services/realtime-market.service";

async function verifyDynamicMapping() {
    console.log("🚀 Starting Dynamic Mapping Verification...");

    // 1. Initialize (Loads instruments from DB)
    console.log("👉 1. Initializing RealTimeMarketService...");
    await realTimeMarketService.initialize();

    // 2. Test Mapping
    console.log("\n👉 2. Testing Symbol Resolution:");
    
    const symbolsToTest = ["RELIANCE", "ADANIENT", "TATASTEEL", "NON_EXISTENT_SYMBOL"];
    
    // We can't access private map directly, but we can infer via subscribe behavior or adding a public method for testing.
    // Let's modify the service temporarily or trust the logs? 
    // Actually, we can use the JS 'any' casting to peek into private state for this test script.
    
    const service = realTimeMarketService as any;
    const isinMap = service.isinMap;
    const reverseMap = service.reverseIsinMap;

    console.log(`   Map Size: ${isinMap.size} symbols loaded.`);

    symbolsToTest.forEach(sym => {
        const isin = isinMap.get(sym);
        console.log(`   Symbol: ${sym.padEnd(20)} -> ISIN: ${isin || "❌ NOT FOUND"}`);
    });

    console.log("\n👉 3. Testing Reverse Resolution (ISIN -> Symbol):");
    const isin = isinMap.get("ADANIENT");
    if (isin) {
        const pureIsin = isin.includes("|") ? isin.split("|")[1] : isin;
        const resolved = reverseMap.get(pureIsin);
        console.log(`   ISIN:   ${pureIsin} -> Symbol: ${resolved}`);
        
        if (resolved === "ADANIENT") {
            console.log("\n✅ SUCCESS: Dynamic Mapping is working correctly!");
        } else {
            console.log("\n❌ FAIL: Reverse lookup failed.");
        }
    } else {
        console.log("\n⚠️ WARNING: ADANIENT not found in DB. Is the database seeded?");
    }

    process.exit(0);
}

verifyDynamicMapping();
