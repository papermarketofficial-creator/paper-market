
import { db } from "@/lib/db";
import { users, wallets, instruments, orders, trades, positions } from "@/lib/db/schema";
import { WalletService } from "@/services/wallet.service";
import { OrderService } from "@/services/order.service";
import { ExecutionService } from "@/services/execution.service";
import { PositionService } from "@/services/position.service";
import { marketSimulation } from "@/services/market-simulation.service";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { eq, ilike } from "drizzle-orm";
import { v4 as uuidv4 } from 'uuid';
import { logger } from "@/lib/logger";

// Disable excessive logs
logger.level = "info";

const TEST_EMAIL = "verify-pnl@example.com";
const INITIAL_BALANCE = 1000000; // 10k
const SYMBOL = "PNL_TEST_EQ";

async function main() {
    console.log("🚀 Starting P&L Verification...");

    // 1. Setup Test User
    let user = await db.query.users.findFirst({
        where: eq(users.email, TEST_EMAIL)
    });

    if (!user) {
        const [newUser] = await db.insert(users).values({
            email: TEST_EMAIL,
            name: "PnL Tester",
            password: "hashed_password",
        }).returning();
        user = newUser;
    }
    console.log(`User ID: ${user.id}`);

    // 2. Reset Wallet
    await db.update(wallets)
        .set({ balance: INITIAL_BALANCE.toString(), blockedBalance: "0" })
        .where(eq(wallets.userId, user.id));
    console.log(`✅ Wallet reset to ${INITIAL_BALANCE}`);

    // 3. Clear Data
    await db.delete(orders).where(eq(orders.userId, user.id));
    await db.delete(trades).where(eq(trades.userId, user.id));
    await db.delete(positions).where(eq(positions.userId, user.id));
    console.log("✅ Previous test data cleared");

    // 4. Setup Instrument
    let instrument = await db.query.instruments.findFirst({
        where: ilike(instruments.tradingsymbol, SYMBOL)
    });

    if (!instrument) {
        await db.insert(instruments).values({
            instrumentToken: "999999",
            exchangeToken: "999999",
            tradingsymbol: SYMBOL,
            name: "PNL TEST EQUITY",
            lastPrice: "100",
            expiry: null,
            strike: null,
            tickSize: "0.05",
            lotSize: 1,
            instrumentType: "EQUITY",
            segment: "NSE_EQ",
            exchange: "NSE",
            isActive: true
        });
        console.log(`✅ Created test instrument ${SYMBOL}`);
    }

    // 5. Seed Simulation
    marketSimulation.setPrice(SYMBOL, 100);
    console.log(`✅ Simulation seeded: ${SYMBOL} @ 100`);

    // ==========================================
    // TEST 1: Long Entry (Buy 10 @ 100)
    // ==========================================
    console.log("\n--- TEST 1: Long Entry ---");
    await OrderService.placeOrder(user.id, {
        symbol: SYMBOL,
        side: "BUY",
        orderType: "MARKET",
        quantity: 10
    });
    
    await ExecutionService.executeOpenOrders(); // Fill @ 100

    const pos1 = (await PositionService.getUserPositionsWithPnL(user.id))[0];
    console.log(`Position: ${pos1.quantity} @ ${pos1.averagePrice} (Realized: ${pos1.realizedPnL})`);
    
    if (pos1.quantity !== 10 || pos1.averagePrice !== 100) {
        console.error("❌ FAIL: Incorrect Position Entry");
        process.exit(1);
    }
    console.log("✅ Entry Verified");

    // ==========================================
    // TEST 2: Unrealized P&L
    // ==========================================
    console.log("\n--- TEST 2: Unrealized P&L ---");
    marketSimulation.setPrice(SYMBOL, 110); // Price moves up by 10
    
    const pos2 = (await PositionService.getUserPositionsWithPnL(user.id))[0];
    // console.log(pos2);
    console.log(`Price: ${pos2.currentPrice}, Unrealized P&L: ${pos2.unrealizedPnL}`);

    if (pos2.unrealizedPnL !== 100) { // (110 - 100) * 10
         console.error(`❌ FAIL: Expected 100 Unrealized, got ${pos2.unrealizedPnL}`);
         process.exit(1);
    }
    console.log("✅ Unrealized P&L Verified");

    // ==========================================
    // TEST 3: Partial Exit (Sell 5 @ 120)
    // ==========================================
    console.log("\n--- TEST 3: Partial Exit ---");
    marketSimulation.setPrice(SYMBOL, 120);
    
    await OrderService.placeOrder(user.id, {
        symbol: SYMBOL,
        side: "SELL",
        orderType: "MARKET",
        quantity: 5
    });
    await ExecutionService.executeOpenOrders(); // Fill @ 120

    const pos3 = (await PositionService.getUserPositionsWithPnL(user.id))[0];
    console.log(`Position: ${pos3.quantity} @ ${pos3.averagePrice} (Realized: ${pos3.realizedPnL})`);

    // Expected Realized: (120 - 100) * 5 = +100
    if (pos3.realizedPnL !== 100) {
        console.error(`❌ FAIL: Expected 100 Realized, got ${pos3.realizedPnL}`);
        process.exit(1);
    }
    if (pos3.quantity !== 5) {
        console.error("❌ FAIL: Incorrect Remaining Quantity");
        process.exit(1);
    }
    console.log("✅ Partial Exit Verified");

    // ==========================================
    // TEST 4: Full Exit (Sell 5 @ 90) -> Loosing Traddr
    // ==========================================
    console.log("\n--- TEST 4: Full Exit (Loss) ---");
    marketSimulation.setPrice(SYMBOL, 90);

    await OrderService.placeOrder(user.id, {
        symbol: SYMBOL,
        side: "SELL",
        orderType: "MARKET",
        quantity: 5
    });
    await ExecutionService.executeOpenOrders(); // Fill @ 90

    // Position should be closed (deleted or quantity 0)
    const positionsList = await PositionService.getPositions(user.id); // Check raw table
    console.log(`Positions remaining: ${positionsList.length}`);

    if (positionsList.length > 0) {
        // Technically logic deletes row if qty is 0.
        console.error("❌ FAIL: Position row should be deleted");
        process.exit(1);
    }

    // Check Wallet for Final P&L Impact
    // Setup: 1000000
    // Buy 10 @ 100: -1000 (Bal: 999000, Pos: 1000)
    // Sell 5 @ 120: +600 (Bal: 999600) -> Net P&L so far +100 (500 cost vs 600 rev) -> Realized +100
    // Sell 5 @ 90: +450 (Bal: 1000050) -> Net P&L for this leg -50 (500 cost vs 450 rev) -> Total Realized +50
    
    // Total Profit expected: +50
    // Final Balance expected: 1000050
    
    const wallet = await WalletService.getWallet(user.id);
    console.log(`Final Balance: ${wallet.balance}`);

    // Allow small float error? No, we use clean numbers here.
    if (parseFloat(wallet.balance) !== 1000050) {
         console.error(`❌ FAIL: Wallet Balance Mismatch. Expected 1000050, got ${wallet.balance}`);
         process.exit(1);
    }

    console.log("✅ Full Exit & Wallet Verified");
    console.log("\n✅ ALL CHECKS PASSED");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
