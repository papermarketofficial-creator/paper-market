// Quick diagnostic: Enable debug mode and check what Upstox sends for indices
// Run this in market-engine directory

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const envPath = join(process.cwd(), ".env");
let envContent = readFileSync(envPath, "utf-8");

// Enable DEBUG_MARKET
envContent = envContent.replace(/DEBUG_MARKET=false/g, "DEBUG_MARKET=true");

writeFileSync(envPath, envContent);

console.log("✅ DEBUG_MARKET enabled");
console.log("📝 Restart market-engine to see raw tick data");
console.log("");
console.log("Look for logs like:");
console.log('  📩 TICK: { "feeds": { "NSE_INDEX|???": { ... } } }');
console.log("");
console.log("This will show the exact format Upstox uses for index keys");
