import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db } from '../lib/db/index.js';
import { instruments, type Instrument } from '../lib/db/schema/index.js';
import { ApiError } from '../lib/errors.js';
import { TradingSafetyService } from '../services/trading-safety.service.js';

const TEST_USER_ID = '9c7aca93-aa99-40bf-9da6-1a30c3c4713a';

function uniqueToken(prefix: string): string {
  return `TEST_${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function futureDate(minutes = 15): Date {
  return new Date(Date.now() + minutes * 60_000);
}

async function expectGuard(label: string, expectedCode: string, fn: () => Promise<void>) {
  try {
    await fn();
    throw new Error(`${label} did not throw ${expectedCode}`);
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    if (error.code !== expectedCode) {
      throw new Error(`${label} returned ${error.code} instead of ${expectedCode}`);
    }
    console.log(`PASS ${label} => ${error.code}`);
  }
}

async function run() {
  const [base] = await db
    .select()
    .from(instruments)
    .where(and(eq(instruments.segment, 'NSE_EQ'), eq(instruments.isActive, true)))
    .limit(1);

  if (!base) {
    throw new Error('No active NSE_EQ instrument found for test baseline');
  }

  const makeInstrument = (overrides: Partial<Instrument>): Instrument => ({ ...base, ...overrides });

  await expectGuard('Expiry Guard', 'EXPIRED_INSTRUMENT', async () => {
    const instrument = makeInstrument({
      instrumentToken: uniqueToken('EXPIRY'),
      expiry: new Date(Date.now() - 60_000),
      lotSize: 1,
      instrumentType: 'EQUITY',
    });

    await TradingSafetyService.validate(TEST_USER_ID, {
      instrumentToken: instrument.instrumentToken,
      symbol: instrument.tradingsymbol,
      side: 'BUY',
      quantity: 1,
      orderType: 'LIMIT',
      limitPrice: 100,
      idempotencyKey: uniqueToken('IDEMP'),
    }, instrument);
  });

  await expectGuard('Stale Price Guard', 'STALE_PRICE', async () => {
    const instrument = makeInstrument({
      instrumentToken: uniqueToken('STALE'),
      tradingsymbol: uniqueToken('STALE_SYM'),
      expiry: futureDate(),
      lotSize: 1,
      instrumentType: 'EQUITY',
      segment: 'NSE_EQ',
    });

    await TradingSafetyService.validate(TEST_USER_ID, {
      instrumentToken: instrument.instrumentToken,
      symbol: instrument.tradingsymbol,
      side: 'BUY',
      quantity: 1,
      orderType: 'MARKET',
      idempotencyKey: uniqueToken('IDEMP'),
    }, instrument);
  });

  await expectGuard('Liquidity Guard', 'ILLIQUID_CONTRACT', async () => {
    const instrument = makeInstrument({
      instrumentToken: uniqueToken('OPT'),
      tradingsymbol: uniqueToken('OPT_SYM'),
      expiry: futureDate(),
      lotSize: 50,
      instrumentType: 'OPTION',
      segment: 'NSE_FO',
    });

    await TradingSafetyService.validate(TEST_USER_ID, {
      instrumentToken: instrument.instrumentToken,
      symbol: instrument.tradingsymbol,
      side: 'BUY',
      quantity: 50,
      orderType: 'LIMIT',
      limitPrice: 10,
      idempotencyKey: uniqueToken('IDEMP'),
    }, instrument);
  });

  await expectGuard('Lot Size Guard', 'INVALID_LOT_SIZE', async () => {
    const instrument = makeInstrument({
      instrumentToken: uniqueToken('LOT'),
      expiry: futureDate(),
      lotSize: 25,
      instrumentType: 'EQUITY',
      segment: 'NSE_EQ',
    });

    await TradingSafetyService.validate(TEST_USER_ID, {
      instrumentToken: instrument.instrumentToken,
      symbol: instrument.tradingsymbol,
      side: 'BUY',
      quantity: 10,
      orderType: 'LIMIT',
      limitPrice: 100,
      idempotencyKey: uniqueToken('IDEMP'),
    }, instrument);
  });

  await expectGuard('Leverage Guard', 'LEVERAGE_EXCEEDED', async () => {
    const instrument = makeInstrument({
      instrumentToken: uniqueToken('LEV'),
      expiry: futureDate(),
      lotSize: 1,
      instrumentType: 'EQUITY',
      segment: 'NSE_EQ',
    });

    await TradingSafetyService.validate(TEST_USER_ID, {
      instrumentToken: instrument.instrumentToken,
      symbol: instrument.tradingsymbol,
      side: 'BUY',
      quantity: 1,
      orderType: 'LIMIT',
      limitPrice: 1_000_000_000,
      idempotencyKey: uniqueToken('IDEMP'),
    }, instrument);
  });

  console.log('All required safety guards validated.');
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Safety guard verification failed:', error);
    process.exit(1);
  });
