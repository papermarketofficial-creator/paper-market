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
    const { db } = await import("@/lib/db");
    const { users, orders, positions } = await import("@/lib/db/schema");
    const { ExecutionService } = await import("@/services/execution.service");
    const { marketSimulation } = await import("@/services/market-simulation.service");
    const { PositionService } = await import("@/services/position.service");
    const { eq } = await import("drizzle-orm");

    console.log("📊 Testing Positions PnL API...");

    // Setup
    await marketSimulation.initialize();

    const TEST_EMAIL = "wallet_test@example.com";
    const user = await db.query.users.findFirst({
        where: eq(users.email, TEST_EMAIL)
    });

    if (!user) {
        console.error("User not found (Run wallet test first)");
        process.exit(1);
    }

    // Ensure we have funds
    await db.update(users).set({ balance: "100000.00" }).where(eq(users.id, user.id));

    // Clear existing positions and trades for clean test
    await db.delete(positions).where(eq(positions.userId, user.id));
    // Must delete trades first due to FK
    const { trades } = await import("@/lib/db/schema");
    await db.delete(trades).where(eq(trades.userId, user.id));
    await db.delete(orders).where(eq(orders.userId, user.id));

    const SYMBOL = "RELIANCE";
    const ENTRY_PRICE = 2500;
    const CURRENT_PRICE = 2600;
    const QTY = 10;

    // Force Market Price for Entry
    marketSimulation.setPrice(SYMBOL, ENTRY_PRICE);

    // Place & Execute Order
    console.log(`Buying ${QTY} ${SYMBOL} at ${ENTRY_PRICE}...`);
    await db.insert(orders).values({
        userId: user.id,
        symbol: SYMBOL,
        side: "BUY",
        orderType: "MARKET",
        quantity: QTY,
        status: "OPEN"
    } as any);

    await ExecutionService.executeOpenOrders();

    // Force Price Change (Profit Scenario)
    marketSimulation.setPrice(SYMBOL, CURRENT_PRICE);
    console.log(`Market Price Moved to ${CURRENT_PRICE}`);

    // Call Service
    const userPositions = await PositionService.getUserPositionsWithPnL(user.id);

    if (userPositions.length === 0) {
        console.error("❌ No positions found!");
        process.exit(1);
    }

    const pos = userPositions[0];
    console.log("\nPosition Details:");
    console.table({
        symbol: pos.symbol,
        qty: pos.quantity,
        entry: pos.averagePrice,
        current: pos.currentPrice,
        pnl: pos.unrealizedPnL,
        instrument: pos.instrument // Should be EQUITY if seeded correctly, or UNKNOWN if just simple reliance
    });

    const expectedPnL = (CURRENT_PRICE - ENTRY_PRICE) * QTY;
    // Allow small floating point diff
    if (Math.abs(pos.unrealizedPnL - expectedPnL) < 0.1) {
        console.log(`✅ PnL Correct! Expected: ${expectedPnL}, Got: ${pos.unrealizedPnL}`);
    } else {
        console.error(`❌ PnL Mismatch! Expected: ${expectedPnL}, Got: ${pos.unrealizedPnL}`);
    }

    process.exit(0);
}

main().catch(console.error);
