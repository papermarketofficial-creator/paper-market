import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db } from '../lib/db/index.js';
import { instruments, orders, type Instrument } from '../lib/db/schema/index.js';
import { ApiError } from '../lib/errors.js';
import { FillEngineService } from '../services/fill-engine.service.js';
import { marketSimulation } from '../services/market-simulation.service.js';
import { TradingSafetyService } from '../services/trading-safety.service.js';

const TEST_USER_ID = '9c7aca93-aa99-40bf-9da6-1a30c3c4713a';

type DbOrder = typeof orders.$inferSelect;

function uniqueKey(prefix: string): string {
  return `TEST_${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function createOrder(overrides: Partial<DbOrder>): DbOrder {
  return {
    id: uniqueKey('ORDER'),
    userId: TEST_USER_ID,
    symbol: 'TEST_SYMBOL',
    instrumentToken: uniqueKey('TOKEN'),
    side: 'BUY',
    quantity: 10,
    orderType: 'MARKET',
    limitPrice: null,
    status: 'OPEN',
    executionPrice: null,
    executedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    rejectionReason: null,
    idempotencyKey: null,
    averagePrice: null,
    realizedPnL: null,
    ...overrides,
  };
}

async function expectSafetyError(label: string, expectedCode: string, fn: () => Promise<void>) {
  try {
    await fn();
    throw new Error(`${label} did not throw ${expectedCode}`);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.code !== expectedCode) {
      throw new Error(`${label} returned ${error.code}, expected ${expectedCode}`);
    }
    console.log(`PASS ${label} => ${error.code}`);
  }
}

async function run(): Promise<void> {
  const [base] = await db
    .select()
    .from(instruments)
    .where(and(eq(instruments.segment, 'NSE_EQ'), eq(instruments.isActive, true)))
    .limit(1);

  if (!base) {
    throw new Error('No active NSE_EQ instrument available for fill-engine test baseline');
  }

  const testSymbol = uniqueKey('EQ');
  const testInstrument: Instrument = {
    ...base,
    instrumentToken: uniqueKey('EQ_TOKEN'),
    tradingsymbol: testSymbol,
    instrumentType: 'EQUITY',
    segment: 'NSE_EQ',
    tickSize: '0.05',
    lotSize: 1,
    expiry: new Date(Date.now() + 30 * 60_000),
  };

  marketSimulation.setPrice(testInstrument.tradingsymbol, 100);

  const marketBuy = createOrder({
    symbol: testInstrument.tradingsymbol,
    instrumentToken: testInstrument.instrumentToken,
    side: 'BUY',
    orderType: 'MARKET',
    quantity: 10,
  });

  const marketSell = createOrder({
    symbol: testInstrument.tradingsymbol,
    instrumentToken: testInstrument.instrumentToken,
    side: 'SELL',
    orderType: 'MARKET',
    quantity: 10,
  });

  const buyDecision = FillEngineService.resolveFill(marketBuy, testInstrument);
  const sellDecision = FillEngineService.resolveFill(marketSell, testInstrument);

  if (!buyDecision.shouldFill || !buyDecision.executionPrice) {
    throw new Error('Market BUY was expected to fill');
  }

  if (!sellDecision.shouldFill || !sellDecision.executionPrice) {
    throw new Error('Market SELL was expected to fill');
  }

  const expectedBuy = Number((100 * (1 + buyDecision.slippageBps / 10000)).toFixed(2));
  if (buyDecision.executionPrice !== expectedBuy) {
    throw new Error(`BUY slippage mismatch: got ${buyDecision.executionPrice}, expected ${expectedBuy}`);
  }

  const expectedSell = Number((100 * (1 - sellDecision.slippageBps / 10000)).toFixed(2));
  if (sellDecision.executionPrice !== expectedSell) {
    throw new Error(`SELL slippage mismatch: got ${sellDecision.executionPrice}, expected ${expectedSell}`);
  }

  if (buyDecision.fillableQuantity !== marketBuy.quantity) {
    throw new Error('fillableQuantity is not full quantity for phase-1 model');
  }

  console.log('PASS Slippage model applied to MARKET fills');

  const earlyBuyLimit = createOrder({
    symbol: testInstrument.tradingsymbol,
    instrumentToken: testInstrument.instrumentToken,
    side: 'BUY',
    orderType: 'LIMIT',
    limitPrice: '99.00',
    quantity: 10,
  });

  const earlySellLimit = createOrder({
    symbol: testInstrument.tradingsymbol,
    instrumentToken: testInstrument.instrumentToken,
    side: 'SELL',
    orderType: 'LIMIT',
    limitPrice: '101.00',
    quantity: 10,
  });

  const buyLimitDecision = FillEngineService.resolveFill(earlyBuyLimit, testInstrument);
  const sellLimitDecision = FillEngineService.resolveFill(earlySellLimit, testInstrument);

  if (buyLimitDecision.shouldFill || sellLimitDecision.shouldFill) {
    throw new Error('Limit orders filled early when they should stay OPEN');
  }

  console.log('PASS LIMIT orders remain OPEN until price condition is met');

  const deterministicA = FillEngineService.resolveFill(marketBuy, testInstrument);
  const deterministicB = FillEngineService.resolveFill(marketBuy, testInstrument);

  if (
    deterministicA.executionPrice !== deterministicB.executionPrice ||
    deterministicA.fillableQuantity !== deterministicB.fillableQuantity ||
    deterministicA.reason !== deterministicB.reason
  ) {
    throw new Error('Deterministic fill check failed for same order/tick input');
  }

  console.log('PASS Deterministic output verified for identical input');

  const staleInstrument: Instrument = {
    ...base,
    instrumentToken: uniqueKey('STALE_TOKEN'),
    tradingsymbol: uniqueKey('STALE_SYMBOL'),
    instrumentType: 'EQUITY',
    segment: 'NSE_EQ',
    tickSize: '0.05',
    lotSize: 1,
    expiry: new Date(Date.now() + 30 * 60_000),
  };

  await expectSafetyError('Safety layer pre-trade stale guard', 'STALE_PRICE', async () => {
    await TradingSafetyService.validate(
      TEST_USER_ID,
      {
        instrumentToken: staleInstrument.instrumentToken,
        symbol: staleInstrument.tradingsymbol,
        side: 'BUY',
        quantity: 1,
        orderType: 'MARKET',
        idempotencyKey: uniqueKey('IDEMP'),
      },
      staleInstrument
    );
  });

  console.log('All fill-engine checks passed.');
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fill-engine verification failed:', error);
    process.exit(1);
  });
