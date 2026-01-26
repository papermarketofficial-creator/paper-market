import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/lib/db";
import { orders, instruments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ExecutionService } from "@/services/execution.service";
import { logger } from "@/lib/logger";

async function debugSystem() {
    console.log("🔍 Starting System Diagnostic...");

    // 1. Check Open Orders
    const openOrders = await db.select().from(orders).where(eq(orders.status, "OPEN"));
    console.log(`\n📋 Open Orders: ${openOrders.length}`);
    openOrders.forEach(o => {
        console.log(`   - ID: ${o.id}, Symbol: ${o.symbol}, Side: ${o.side}, Type: ${o.orderType}`);
    });

    if (openOrders.length === 0) {
        console.log("✅ No open orders to execute.");
        process.exit(0);
    }

    // 2. Check Instrument Prices
    console.log("\n💰 Checking Prices for Open Orders...");
    const symbols = [...new Set(openOrders.map(o => o.symbol))];

    for (const sym of symbols) {
        const [inst] = await db.select().from(instruments).where(eq(instruments.tradingsymbol, sym));
        if (!inst) {
            console.error(`❌ Instrument NOT FOUND: ${sym}`);
        } else {
            console.log(`   - ${sym}: ${inst.lastPrice} (Active: ${inst.isActive})`);
        }
    }

    // 3. Force Execution
    console.log("\n⚡ Attempting Manual Execution...");
    try {
        const result = await ExecutionService.executeOpenOrders();
        console.log("\n✅ Execution Result:");
        console.log(`   - Executed Count: ${result}`);
    } catch (err) {
        console.error("\n❌ Execution Failed:", err);
    }

    process.exit(0);
}

debugSystem();
