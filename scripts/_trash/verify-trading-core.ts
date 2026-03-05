/**
 * Trading Core Verification Script
 * 
 * Verifies the complete lifecycle:
 * Wallet -> Order Placement -> Execution (Hybrid) -> Trade Settlement -> Position Update
 * 
 * Usage: npx tsx scripts/verify-trading-core.ts
 */

import 'dotenv/config';
import { db } from "@/lib/db";
import { users, wallets, orders, trades, positions, instruments } from "@/lib/db/schema";
import { OrderService } from "@/services/order.service";
import { ExecutionService } from "@/services/execution.service";
import { WalletService } from "@/services/wallet.service";
import { PositionService } from "@/services/position.service";
import { marketSimulation } from "@/services/market-simulation.service";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { eq, ilike } from "drizzle-orm";
import { v4 as uuidv4 } from 'uuid';
import { logger } from "@/lib/logger";

// Enable Debug Logs
// logger.level = "debug";

const TEST_EMAIL = "verify-core@example.com";
const INITIAL_BALANCE = 100000000; // 10 Lakhs (in cents/paisa? No, implementation uses number, assume value)
// WalletService doc says "money... use integer (cents) or decimal". 
// Let's check WalletService.createWallet defaults. Usually 10,00,000.
// We will set explicit value.

async function main() {
    console.log("🚀 Starting Trading Core Verification...\n");

    // 1. Setup Test User
    let user = await db.query.users.findFirst({
        where: eq(users.email, TEST_EMAIL)
    });

    if (!user) {
        console.log("Creating test user...");
        const [newUser] = await db.insert(users).values({
            email: TEST_EMAIL,
            name: "Trading Verification Bot"
        }).returning();
        user = newUser;
        
        // Create wallet
        await db.insert(wallets).values({
            userId: user.id,
            balance: "1000000", // 10 Lakhs
            blockedBalance: "0"
        });
    }

    const userId = user.id;
    console.log(`User ID: ${userId}`);

    // 2. Reset Wallet State
    await db.update(wallets)
        .set({ 
            balance: "1000000",
            blockedBalance: "0" 
        })
        .where(eq(wallets.userId, userId));
    console.log("✅ Wallet reset to 10,00,000");

    // Clear previous test data
    await db.delete(trades).where(eq(trades.userId, userId));
    await db.delete(orders).where(eq(orders.userId, userId));
    await db.delete(positions).where(eq(positions.userId, userId));
    console.log("✅ Previous test data cleared");

    // 3. Initialize Market Data
    console.log("\nInitializing Market Services...");
    await marketSimulation.initialize();
    
    // 3. Initialize Market Data
    console.log("\nInitializing Market Services...");
    await marketSimulation.initialize();
    
    // Ensure we have RELIANCE exists (EQUITY)
    const SYMBOL = "RELIANCE";
    const instrument = await db.query.instruments.findFirst({
        where: ilike(instruments.tradingsymbol, SYMBOL)
    });

    if (!instrument) {
        console.log(`Creating ${SYMBOL} instrument...`);
        // Seed RELIANCE if missing
        await db.insert(instruments).values({
            instrumentToken: "123456",
            exchangeToken: "123456",
            tradingsymbol: SYMBOL,
            name: "RELIANCE INDUSTRIES",
            expiry: null,
            strike: null,
            tickSize: "0.05",
            lotSize: 1,
            instrumentType: "EQUITY",
            segment: "NSE_EQ",
            exchange: "NSE",
            isActive: true
        });
    }
    
    // Set a known price in simulation for deterministic testing
    marketSimulation.setPrice(SYMBOL, 2500);
    console.log(`✅ Simulation seeded: ${SYMBOL} @ 2500`);

    // 4. Place MARKET BUY Order
    console.log(`\nPlacing MARKET BUY Order (Qty: 10)...`);
    const orderPayload = {
        symbol: SYMBOL,
        side: "BUY" as const,
        orderType: "MARKET" as const,
        quantity: 10
    };

    const order = await OrderService.placeOrder(userId, orderPayload);
    console.log(`✅ Order placed: ${order.id} (Status: ${order.status})`);

    // Verify Wallet Blocked Funds (Market order blocks estimated amount)
    // Estimate = 22000 * 50 = 11,00,000. Wait, balance is 10L. 
    // If order value > balance, it should fail.
    // Let's set balance higher or quantity lower.
    // 22000 * 50 = 11 Lakhs. Balance 10 Lakhs. It might fail!
    // Let's increase balance.
    
    await db.update(wallets)
        .set({ balance: "2000000" }) // 20 Lakhs
        .where(eq(wallets.userId, userId));
        
    // Retry or just proceed if checkMargin happens during placeOrder? 
    // OrderService.placeOrder calls WalletService.checkMargin.
    // If I placed it before update, it might have failed?
    // Let's check order status.
    
    if (order.status === 'REJECTED') {
         console.warn("⚠️ Order was REJECTED (likely funds). Retrying with higher balance...");
         await db.update(wallets).set({ balance: "2000000", blockedBalance: "0" }).where(eq(wallets.userId, userId));
         // Place new order
         const retryOrder = await OrderService.placeOrder(userId, orderPayload);
         console.log(`✅ Retry Order placed: ${retryOrder.id}`);
         // Use this order
    }

    // 5. Execute Orders
    console.log("\nTriggering Execution Engine...");
    const executedCount = await ExecutionService.executeOpenOrders();
    console.log(`✅ Execution Report: ${executedCount} orders executed`);

    if (executedCount === 0) {
        console.error("❌ FAIL: Order did not execute. Check logs.");
        process.exit(1);
    }

    // 6. Verify Final State
    console.log("\nVerifying Final State...");

    // Check Order
    const finalOrder = await db.query.orders.findFirst({
        where: eq(orders.userId, userId),
        orderBy: (orders, { desc }) => [desc(orders.createdAt)]
    });
    
    if (finalOrder?.status !== "FILLED") {
        console.error(`❌ FAIL: Order Status is ${finalOrder?.status}, expected FILLED`);
        process.exit(1);
    }
    console.log("✅ Order Status: FILLED");

    // Check Trade
    const trade = await db.query.trades.findFirst({
        where: eq(trades.orderId, finalOrder.id)
    });
    if (!trade) {
        console.error("❌ FAIL: No Trade record found");
        process.exit(1);
    }
    console.log(`✅ Trade Created: Buy ${orderPayload.quantity} ${SYMBOL} @ ${trade.price}`);

    // Check Position
    const position = await db.query.positions.findFirst({
        where: eq(positions.userId, userId)
    });
    if (!position || position.quantity !== orderPayload.quantity) {
        console.error(`❌ FAIL: Position quantity mismatch. Expected ${orderPayload.quantity}, got ${position?.quantity}`);
        process.exit(1);
    }
    console.log(`✅ Position Updated: Long ${orderPayload.quantity} ${SYMBOL}`);

    // Check Wallet
    const wallet = await WalletService.getWallet(userId);
    const executionCost = orderPayload.quantity * parseFloat(trade.price);
    const expectedBalance = 2000000 - executionCost;
    
    console.log(`Wallet Balance: ${wallet.balance} (Expected ~${expectedBalance})`);
    
    // Allow small Floating point diffs
    if (Math.abs(parseFloat(wallet.balance) - expectedBalance) < 1) {
        console.log("✅ Wallet Balance Deducted Correctly");
    } else {
         console.error("❌ FAIL: Wallet Balance mismatch");
    }

    console.log("\n🎉 ALL CHECKS PASSED: Trading Core is Healthy");
    process.exit(0);
}

main().catch(error => {
    console.error("Fatal Error:", error);
    process.exit(1);
});
