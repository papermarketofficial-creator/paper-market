import 'dotenv/config';
import { and, eq, gte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/db/index.js';
import { instruments, positions, users } from '../lib/db/schema/index.js';
import { OrderService } from '../services/order.service.js';
import { ExecutionService } from '../services/execution.service.js';
import { WalletService } from '../services/wallet.service.js';
import { marketSimulation } from '../services/market-simulation.service.js';
import { mtmEngineService } from '../services/mtm-engine.service.js';
import { tickBus } from '../lib/trading/tick-bus.js';
import { TRADING_UNIVERSE } from '../lib/trading-universe.js';

const EPSILON = 0.2;

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > EPSILON) {
    throw new Error(`${label} mismatch: actual=${actual.toFixed(2)} expected=${expected.toFixed(2)}`);
  }
}

async function run(): Promise<void> {
  const testUserId = `mtm-test-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const testUserEmail = `${testUserId}@example.com`;

  let openedToken: string | null = null;
  let openedSymbol: string | null = null;
  let openedQty = 0;
  let openedTickSize = 0.05;

  try {
    console.log('\n?? MTM Engine Test (Futures)\n');
    console.log('='.repeat(60));

    await db.insert(users).values({
      id: testUserId,
      name: 'MTM Test User',
      email: testUserEmail,
    });

    const futures = await db
      .select()
      .from(instruments)
      .where(and(
        eq(instruments.segment, 'NSE_FO'),
        eq(instruments.instrumentType, 'FUTURE'),
        eq(instruments.isActive, true),
        gte(instruments.expiry, new Date())
      ))
      .limit(200);

    const allowedIndexNames = new Set(
      TRADING_UNIVERSE.indices.map((item) =>
        String(item).toUpperCase().replace(/[^A-Z0-9]/g, '')
      )
    );

    const future = futures.find((candidate) => {
      const normalizedName = String(candidate.name || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      return allowedIndexNames.has(normalizedName);
    });

    if (!future) {
      throw new Error('No active FUTURE instrument found for MTM test');
    }

    const qty = Math.max(1, Number(future.lotSize));
    const buyLimit = 50000;

    openedToken = future.instrumentToken;
    openedSymbol = future.tradingsymbol;
    openedQty = qty;
    openedTickSize = Math.max(0.05, Number(future.tickSize) || 0.05);

    console.log(`1) Selected future: ${future.tradingsymbol} (${future.instrumentToken})`);
    console.log(`   Qty: ${qty}`);

    // Ensure deterministic fill path from simulation if no live quote exists
    marketSimulation.setPrice(future.tradingsymbol, 20000);

    console.log('2) Placing BUY LIMIT order...');
    await OrderService.placeOrder(testUserId, {
      instrumentToken: future.instrumentToken,
      symbol: future.tradingsymbol,
      side: 'BUY',
      quantity: qty,
      orderType: 'LIMIT',
      limitPrice: buyLimit,
      idempotencyKey: randomUUID(),
    });

    await ExecutionService.executeOpenOrders();

    const [position] = await db
      .select()
      .from(positions)
      .where(and(
        eq(positions.userId, testUserId),
        eq(positions.instrumentToken, future.instrumentToken)
      ))
      .limit(1);

    if (!position) {
      throw new Error('Expected open position after BUY order, but none was found');
    }

    const avgPrice = Number(position.averagePrice);
    const signedQty = Number(position.quantity);
    if (!Number.isFinite(avgPrice) || avgPrice <= 0 || signedQty === 0) {
      throw new Error('Position data invalid for MTM test');
    }

    console.log(`3) Position opened @ ${avgPrice.toFixed(2)} qty=${signedQty}`);

    await mtmEngineService.initialize();
    await mtmEngineService.forceRefreshOpenState();

    const movedPrice = avgPrice + 100;
    tickBus.emitTick({
      instrumentKey: future.instrumentToken,
      symbol: future.tradingsymbol,
      price: movedPrice,
      volume: 1,
      timestamp: Math.floor(Date.now() / 1000),
      exchange: future.exchange,
      close: avgPrice,
    });

    // TickBus dispatch is deferred; wait a short moment before flushing snapshots.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await mtmEngineService.forceFlush();

    const snapshot = mtmEngineService.getUserSnapshot(testUserId);
    if (!snapshot) {
      throw new Error('MTM snapshot not available for test user');
    }

    const wallet = await WalletService.getWallet(testUserId);
    const balance = Number(wallet.balance);
    const persistedEquity = Number(wallet.equity);

    const expectedUnrealized = signedQty > 0
      ? (movedPrice - avgPrice) * signedQty
      : (avgPrice - movedPrice) * Math.abs(signedQty);

    const expectedEquity = balance + snapshot.realizedPnL + expectedUnrealized;

    assertClose(snapshot.unrealizedPnL, expectedUnrealized, 'Unrealized PnL');
    assertClose(snapshot.equity, expectedEquity, 'In-memory equity');
    assertClose(persistedEquity, snapshot.equity, 'Persisted wallet equity');

    console.log(`4) PASS Unrealized PnL = ${snapshot.unrealizedPnL.toFixed(2)}`);
    console.log(`5) PASS Equity updated = ${snapshot.equity.toFixed(2)} (status=${snapshot.marginStatus})`);

    console.log('\n' + '='.repeat(60));
    console.log('? MTM test completed successfully\n');
  } finally {
    // Cleanup: close test position if still open
    if (openedToken && openedSymbol && openedQty > 0) {
      try {
        const [livePosition] = await db
          .select()
          .from(positions)
          .where(and(
            eq(positions.userId, testUserId),
            eq(positions.instrumentToken, openedToken)
          ))
          .limit(1);

        const closeQuantity = Math.abs(Number(livePosition?.quantity || openedQty));
        if (closeQuantity <= 0) {
          await mtmEngineService.shutdown();
          return;
        }

        const roundedCleanupPrice = Number(Math.max(openedTickSize, openedTickSize).toFixed(2));
        marketSimulation.setPrice(openedSymbol, roundedCleanupPrice);

        await OrderService.placeOrder(testUserId, {
          instrumentToken: openedToken,
          symbol: openedSymbol,
          side: 'SELL',
          quantity: closeQuantity,
          orderType: 'LIMIT',
          limitPrice: roundedCleanupPrice,
          idempotencyKey: randomUUID(),
        });
        await ExecutionService.executeOpenOrders();
        await mtmEngineService.forceRefreshOpenState();
      } catch (cleanupError) {
        console.error('Cleanup warning:', cleanupError);
      }
    }

    await mtmEngineService.shutdown();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n? MTM test failed:', error);
    process.exit(1);
  });
