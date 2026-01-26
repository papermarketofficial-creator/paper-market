/**
 * Test script for Upstox WebSocket
 * 
 * Usage: npx tsx scripts/test-upstox-ws.ts
 * 
 * Connects to Upstox WebSocket and logs incoming market data.
 * Requires UPSTOX_ACCESS_TOKEN in .env
 */

import { UpstoxWebSocket } from "@/lib/integrations/upstox/websocket";

async function main(): Promise<void> {
    console.log("Testing Upstox WebSocket connection...\n");

    const ws = new UpstoxWebSocket();
    let tickCount = 0;

    try {
        await ws.connect((data) => {
            tickCount++;
            
            // Log first few ticks with full data
            if (tickCount <= 5) {
                console.log(`Tick ${tickCount}:`, JSON.stringify(data).slice(0, 200));
            } else if (tickCount % 10 === 0) {
                console.log(`Received ${tickCount} ticks...`);
            }
        });

        console.log("✅ WebSocket connected!\n");

        // Subscribe to NIFTY 50 index
        const instruments = [
            "NSE_INDEX|Nifty 50",
            "NSE_INDEX|Nifty Bank"
        ];
        
        console.log(`Subscribing to: ${instruments.join(", ")}`);
        ws.subscribe(instruments);

        // Keep alive for 30 seconds
        console.log("\nListening for 30 seconds...\n");
        
        await new Promise((resolve) => setTimeout(resolve, 30000));

        console.log(`\n✅ Test complete. Received ${tickCount} ticks total.`);
        ws.disconnect();
        process.exit(0);

    } catch (error) {
        console.error("❌ ERROR:", error instanceof Error ? error.message : "Unknown error");
        process.exit(1);
    }
}

main();
