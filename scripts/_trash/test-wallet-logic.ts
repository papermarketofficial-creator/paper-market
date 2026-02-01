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
    const { users, orders } = await import("@/lib/db/schema");
    const { ExecutionService } = await import("@/services/execution.service");
    const { marketSimulation } = await import("@/services/market-simulation.service");
    const { eq } = await import("drizzle-orm");

    console.log("💰 Testing Wallet Logic...");

    // Setup: Initialize Simulation
    await marketSimulation.initialize();

    // Setup: Create/Get Test User
    const TEST_EMAIL = "wallet_test@example.com";
    let user = await db.query.users.findFirst({
        where: eq(users.email, TEST_EMAIL)
    });

    if (!user) {
        console.log("Creating new test user...");
        const [newUser] = await db.insert(users).values({
            name: "Wallet Tester",
            email: TEST_EMAIL,
            balance: "100000.00", // 100k Start
        }).returning();
        user = newUser;
    } else {
        // Reset balance
        console.log("Resetting user balance to 100k...");
        const [updated] = await db.update(users)
            .set({ balance: "100000.00" })
            .where(eq(users.id, user.id))
            .returning();
        user = updated;
    }

    console.log(`User Balance: ${user.balance}`);

    // --- TEST 1: BUY ORDER (Deduct Funds) ---
    console.log("\n--- TEST 1: BUY ORDER (Deduct Funds) ---");
    const SYMBOL = "RELIANCE";
    const PRICE = 2500;
    const QTY = 10;
    const COST = PRICE * QTY;

    // Force Price
    marketSimulation.setPrice(SYMBOL, PRICE);
    console.log(`Forced Market Price for ${SYMBOL}: ${PRICE}`);

    // Place Order
    const [buyOrder] = await db.insert(orders).values({
        userId: user.id,
        symbol: SYMBOL,
        side: "BUY",
        orderType: "MARKET",
        quantity: QTY,
        status: "OPEN"
    } as any).returning();
    console.log(`Placed BUY Order: ${buyOrder.id}`);

    // Execute
    const execCount = await ExecutionService.executeOpenOrders();
    console.log(`Executed Orders: ${execCount}`);

    // Verify Balance
    const [userAfterBuy] = await db.select().from(users).where(eq(users.id, user.id));
    console.log(`Balance after BUY: ${userAfterBuy.balance}`);

    const expectedBalance = 100000 - COST;
    if (Math.abs(parseFloat(userAfterBuy.balance) - expectedBalance) < 0.01) {
        console.log("✅ Balance deduction correct!");
    } else {
        console.error(`❌ Balance mismatch! Expected: ${expectedBalance}, Got: ${userAfterBuy.balance}`);
    }


    // --- TEST 2: SELL ORDER (Credit Funds) ---
    console.log("\n--- TEST 2: SELL ORDER (Credit Funds) ---");
    const SELL_PRICE = 2600;
    const REVENUE = SELL_PRICE * QTY;

    // Force Price
    marketSimulation.setPrice(SYMBOL, SELL_PRICE);

    // Place Order
    const [sellOrder] = await db.insert(orders).values({
        userId: user.id,
        symbol: SYMBOL,
        side: "SELL",
        orderType: "MARKET",
        quantity: QTY,
        status: "OPEN"
    } as any).returning();
    console.log(`Placed SELL Order: ${sellOrder.id}`);

    // Execute
    await ExecutionService.executeOpenOrders();

    // Verify Balance
    const [userAfterSell] = await db.select().from(users).where(eq(users.id, user.id));
    console.log(`Balance after SELL: ${userAfterSell.balance}`);

    const expectedBalanceAfterSell = expectedBalance + REVENUE;
    if (Math.abs(parseFloat(userAfterSell.balance) - expectedBalanceAfterSell) < 0.01) {
        console.log("✅ Balance credit correct!");
    } else {
        console.error(`❌ Balance mismatch! Expected: ${expectedBalanceAfterSell}, Got: ${userAfterSell.balance}`);
    }

    // --- TEST 3: INSUFFICIENT FUNDS ---
    console.log("\n--- TEST 3: INSUFFICIENT FUNDS (Reject Order) ---");

    // Set balance to near zero
    await db.update(users).set({ balance: "10.00" }).where(eq(users.id, user.id));
    console.log("Set Balance to 10.00");

    // Place High Value Order
    const [failOrder] = await db.insert(orders).values({
        userId: user.id,
        symbol: SYMBOL,
        side: "BUY",
        orderType: "MARKET",
        quantity: QTY, // Cost 26000 > 10
        status: "OPEN"
    } as any).returning();

    // Execute
    await ExecutionService.executeOpenOrders();

    // Check Order Status
    const [checkedFailOrder] = await db.select().from(orders).where(eq(orders.id, failOrder.id));
    console.log(`Order Status: ${checkedFailOrder.status}`);

    if (checkedFailOrder.status === "REJECTED") {
        console.log("✅ Order correctly REJECTED due to insufficient funds.");
    } else {
        console.error(`❌ Order should be REJECTED, but is ${checkedFailOrder.status}`);
    }

    process.exit(0);
}

main().catch(console.error);
