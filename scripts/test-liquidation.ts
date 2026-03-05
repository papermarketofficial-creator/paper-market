import "dotenv/config";
import { and, eq, gte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db/index.js";
import { instruments, positions, users } from "../lib/db/schema/index.js";
import { OrderService } from "../services/order.service.js";
import { ExecutionService } from "../services/execution.service.js";
import { WalletService } from "../services/wallet.service.js";
import { marketSimulation } from "../services/market-simulation.service.js";
import { mtmEngineService } from "../services/mtm-engine.service.js";
import { tickBus } from "../lib/trading/tick-bus.js";
import { TRADING_UNIVERSE } from "../lib/trading-universe.js";

const WAIT_TIMEOUT_MS = 7000;
const WAIT_STEP_MS = 150;

async function waitForCondition(
    fn: () => Promise<boolean>,
    timeoutMs = WAIT_TIMEOUT_MS,
    stepMs = WAIT_STEP_MS
): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (await fn()) return true;
        await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
    return false;
}

async function run(): Promise<void> {
    const testUserId = `liquidation-test-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const testUserEmail = `${testUserId}@example.com`;

    console.log("\nLiquidation Engine Test\n");
    console.log("=".repeat(60));

    await db.insert(users).values({
        id: testUserId,
        name: "Liquidation Test User",
        email: testUserEmail,
    });

    const futures = await db
        .select()
        .from(instruments)
        .where(and(
            eq(instruments.segment, "NSE_FO"),
            eq(instruments.instrumentType, "FUTURE"),
            eq(instruments.isActive, true),
            gte(instruments.expiry, new Date())
        ))
        .limit(200);

    const allowedIndexNames = new Set(
        TRADING_UNIVERSE.indices.map((item) =>
            String(item).toUpperCase().replace(/[^A-Z0-9]/g, "")
        )
    );

    const future = futures.find((candidate) => {
        const normalizedName = String(candidate.name || "")
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");
        return allowedIndexNames.has(normalizedName);
    });

    if (!future) {
        throw new Error("No active allowed FUTURE instrument found for liquidation test");
    }

    const qty = Math.max(1, Number(future.lotSize)) * 6;
    const openPrice = 20000;

    console.log(`1) Selected ${future.tradingsymbol} (${future.instrumentToken}), qty=${qty}`);

    marketSimulation.setPrice(future.tradingsymbol, openPrice);

    await OrderService.placeOrder(testUserId, {
        instrumentToken: future.instrumentToken,
        symbol: future.tradingsymbol,
        side: "BUY",
        quantity: qty,
        orderType: "LIMIT",
        limitPrice: openPrice + 5000,
        idempotencyKey: randomUUID(),
    });

    await ExecutionService.executeOpenOrders();

    const [openedPosition] = await db
        .select()
        .from(positions)
        .where(and(
            eq(positions.userId, testUserId),
            eq(positions.instrumentToken, future.instrumentToken)
        ))
        .limit(1);

    if (!openedPosition) {
        throw new Error("Failed to open futures position for liquidation test");
    }

    await mtmEngineService.initialize();
    await mtmEngineService.forceRefreshOpenState();

    const beforeShock = mtmEngineService.getUserSnapshot(testUserId);
    if (!beforeShock) {
        throw new Error("Missing MTM snapshot before liquidation trigger");
    }

    const shockPrice = Math.max(1, Number((openPrice * 0.01).toFixed(2)));
    marketSimulation.setPrice(future.tradingsymbol, shockPrice);

    tickBus.emitTick({
        instrumentKey: future.instrumentToken,
        symbol: future.tradingsymbol,
        price: shockPrice,
        volume: 1,
        timestamp: Math.floor(Date.now() / 1000),
        exchange: future.exchange,
        close: openPrice,
    });

    const closed = await waitForCondition(async () => {
        const livePositions = await db
            .select()
            .from(positions)
            .where(eq(positions.userId, testUserId));
        return livePositions.length === 0;
    });

    await mtmEngineService.forceRefreshOpenState();
    await mtmEngineService.forceFlush();

    const afterLiquidation = mtmEngineService.getUserSnapshot(testUserId);
    const wallet = await WalletService.getWallet(testUserId);

    if (!closed) {
        throw new Error("Liquidation did not close all positions within timeout");
    }

    if (!afterLiquidation) {
        throw new Error("Missing MTM snapshot after liquidation");
    }

    if (wallet.accountState === "LIQUIDATING") {
        throw new Error("Account remained in LIQUIDATING state after forced close");
    }

    const maintenanceAfter = afterLiquidation.requiredMargin * 0.5;
    if (afterLiquidation.equity <= maintenanceAfter) {
        throw new Error(
            `Equity did not recover above maintenance after liquidation: equity=${afterLiquidation.equity}, maintenance=${maintenanceAfter}`
        );
    }

    console.log(`2) PASS Triggered stress: equity ${beforeShock.equity.toFixed(2)} -> shock ${shockPrice}`);
    console.log(`3) PASS Positions force-closed: accountState=${wallet.accountState}`);
    console.log(
        `4) PASS Equity recovered above maintenance: equity=${afterLiquidation.equity.toFixed(2)}, requiredMargin=${afterLiquidation.requiredMargin.toFixed(2)}`
    );

    await mtmEngineService.shutdown();

    console.log("\n" + "=".repeat(60));
    console.log("Liquidation test completed successfully\n");
}

run()
    .then(() => process.exit(0))
    .catch(async (error) => {
        console.error("\nLiquidation test failed:", error);
        try {
            await mtmEngineService.shutdown();
        } catch {
            // Ignore shutdown cleanup errors in test mode.
        }
        process.exit(1);
    });
