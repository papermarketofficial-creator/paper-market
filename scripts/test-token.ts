/**
 * Test script for UpstoxTokenProvider
 * 
 * Usage: npx tsx scripts/test-token.ts
 * 
 * Verifies that the token provider can successfully read the access token
 * from the environment.
 */

import { UpstoxTokenProvider } from "@/lib/integrations/upstox/token-provider";

async function main(): Promise<void> {
    console.log("Testing UpstoxTokenProvider...\n");

    const provider = new UpstoxTokenProvider();

    // Check if token is available
    if (!provider.hasToken()) {
        console.error("❌ FAIL: No token configured in environment");
        console.error("Run: npx tsx scripts/generate-upstox-token.ts <CODE>");
        process.exit(1);
    }

    try {
        const token = await provider.getToken();
        
        // Show masked token for confirmation
        const masked = token.slice(0, 10) + "..." + token.slice(-6);
        console.log("✅ SUCCESS: Token loaded");
        console.log(`   Preview: ${masked}`);
        console.log(`   Length: ${token.length} characters`);
        
    } catch (error) {
        console.error("❌ FAIL:", error instanceof Error ? error.message : "Unknown error");
        process.exit(1);
    }
}

main();
