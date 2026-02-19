/**
 * PRODUCTION Instrument Sync Service (Upstox)
 *
 * STRATEGY: TOKEN-DIFF (Industry Standard)
 * 1. Download & Parse
 * 2. SAFETY BREAK: Abort if count < 50,000 (Prevents bad syncs)
 * 3. Upsert Batch
 * 4. Diff & Deactivate:
 *    - Fetch all ACTIVE tokens from DB
 *    - Calculate diff (DB - New)
 *    - Deactivate only the difference
 *
 * GUARDS:
 * - Strict Segment Filtering (NSE_EQ, NSE_FO, NSE_INDEX)
 * - Type Normalization
 * - No Timestamp Dependencies
 */

import { db } from '@/lib/db';
import { instruments, type Instrument } from '@/lib/db/schema';
import { logger } from '@/lib/logger';
import { ApiError } from '@/lib/errors';
import { sql, and, inArray, eq } from 'drizzle-orm';
import zlib from 'zlib';

const UPSTOX_INSTRUMENTS_URL =
  'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz';

const BATCH_SIZE = 2000;
const SYNC_LOCK_TTL_MS = 30 * 60 * 1000;
const MIN_SAFETY_COUNT = 50000; // CRITICAL: Never sync if upstream gives less than this
const DEFAULT_MIN_FUTURES_COUNT = 500;
const MIN_FUTURES_COUNT = (() => {
  const parsed = Number(process.env.MIN_FUTURES_COUNT ?? DEFAULT_MIN_FUTURES_COUNT);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MIN_FUTURES_COUNT;
})();

interface UpstoxInstrument {
  instrument_key: string;
  exchange_token: string;
  trading_symbol: string;
  name: string;
  expiry?: string;
  strike?: number | string;
  tick_size?: number | string;
  lot_size?: number | string;
  instrument_type: string;
  segment: string;
  exchange: string;
}

interface ParsedInstrument {
  instrumentToken: string;
  exchangeToken: string;
  tradingsymbol: string;
  name: string;
  expiry: Date | null;
  strike: string | null;
  tickSize: string;
  lotSize: number;
  instrumentType: string;
  segment: string;
  exchange: string;
  isActive: boolean;
  lastSyncedAt: Date;
}

export interface SyncReport {
  totalProcessed: number;
  upserted: number;
  updated: number;
  deactivated: number;
  errors: number;
  duration: number;
  startTime: Date;
  endTime: Date;
}

/**
 * SIMPLE PROCESS LOCK
 */
class SyncLock {
  private static lockTime: number | null = null;

  static acquire(): boolean {
    const now = Date.now();
    if (this.lockTime && now - this.lockTime < SYNC_LOCK_TTL_MS) {
      return false;
    }
    this.lockTime = now;
    return true;
  }

  static release() {
    this.lockTime = null;
  }
}

/**
 * Async gunzip helper
 */
function gunzipAsync(buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gunzip(buffer, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/**
 * DOWNLOAD WITH TIMEOUT
 */
async function downloadInstruments(): Promise<UpstoxInstrument[]> {
  logger.info('Downloading instruments from Upstox');

  const controller = new AbortController();
  const timeout = setTimeout(() => { controller.abort(); }, 60000); // 60 sec

  try {
    const res = await fetch(UPSTOX_INSTRUMENTS_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const compressed = Buffer.from(await res.arrayBuffer());
    const decompressed = await gunzipAsync(compressed);
    const data = JSON.parse(decompressed.toString('utf-8'));

    logger.info({ count: data.length }, 'Instrument download complete');
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Normalize Type & Segment
 */
function normalizeType(type: string): string {
    const t = type?.toUpperCase() || '';

    // Futures (defensive against broker enum changes)
    if (t.startsWith('FUT')) return 'FUTURE';

    // Options
    if (
        t.startsWith('OPT') ||
        t === 'CE' ||
        t === 'PE'
    ) {
        return 'OPTION';
    }

    if (t === 'EQ') return 'EQUITY';
    if (t === 'INDEX') return 'INDEX';

    return t;
}

/**
 * Normalize Instrument Data
 */
function normalize(raw: UpstoxInstrument, syncTime: Date): ParsedInstrument | null {
  try {
    // 1. Strict Segment Filter
    if (raw.segment !== 'NSE_EQ' && raw.segment !== 'NSE_FO' && raw.segment !== 'NSE_INDEX') {
        return null; 
    }

    if (!raw.instrument_key || !raw.trading_symbol) return null;

    let expiry: Date | null = null;
    if (raw.expiry) {
      const d = new Date(raw.expiry);
      if (!isNaN(d.getTime())) expiry = d;
    }

    // Default lotSize = 1 if missing/invalid
    const lotSize = Number(raw.lot_size);
    const validLotSize = (isNaN(lotSize) || lotSize <= 0) ? 1 : lotSize;

    return {
      instrumentToken: raw.instrument_key,
      exchangeToken: raw.exchange_token ?? '',
      tradingsymbol: raw.trading_symbol,
      name: raw.name ?? raw.trading_symbol,
      expiry,
      strike: raw.strike ? String(raw.strike) : null,
      tickSize: String(raw.tick_size ?? '0.05'),
      lotSize: validLotSize,
      instrumentType: normalizeType(raw.instrument_type),
      segment: raw.segment,
      exchange: raw.exchange,
      isActive: true, // Always active if present in master
      lastSyncedAt: syncTime,
    };
  } catch (err) {
    return null;
  }
}

/**
 * BULK UPSERT
 */
async function bulkUpsert(parsed: ParsedInstrument[]) {
  // Use a transaction could be safer, but for 100k rows, batching is fine.
  // We handle deactivation *after* all upserts are done.
  
  for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
    const batch = parsed.slice(i, i + BATCH_SIZE);
    try {
        await db
        .insert(instruments)
        .values(batch)
        .onConflictDoUpdate({
            target: instruments.instrumentToken,
            set: {
                exchangeToken: sql`EXCLUDED."exchangeToken"`,
                tradingsymbol: sql`EXCLUDED.tradingsymbol`,
                name: sql`EXCLUDED.name`,
                expiry: sql`EXCLUDED.expiry`,
                strike: sql`EXCLUDED.strike`,
                tickSize: sql`EXCLUDED."tickSize"`,
                lotSize: sql`EXCLUDED."lotSize"`,
                instrumentType: sql`EXCLUDED."instrumentType"`,
                segment: sql`EXCLUDED.segment`,
                exchange: sql`EXCLUDED.exchange`,
                isActive: true,
                lastSyncedAt: sql`EXCLUDED."lastSyncedAt"`,
                updatedAt: new Date(),
            },
        });
        
        if (i % 20000 === 0) {
            logger.info({ progress: i }, 'Upserting...');
        }
    } catch (err) {
        logger.error({ err, batchIndex: i }, 'Batch upsert failed - skipping batch');
    }
  }
}

/**
 * TOKEN-DIFF DEACTIVATION
 * Deactivates any instrument active in DB but missing from the current Sync.
 */
async function deactivateMissing(syncedTokens: Set<string>): Promise<number> {
    try {
        logger.info('Starting diff calculation for deactivation...');

        // 1. Fetch ALL currently active tokens from DB
        // We only care about segments we manage (NSE_EQ, NSE_FO, NSE_INDEX)
        // Adjust filter if you want to deactivate *everything* else.
        // Assuming we own the whole table for these segments.
        const activeInDb = await db
            .select({ token: instruments.instrumentToken })
            .from(instruments)
            .where(
              and(
                eq(instruments.isActive, true),
                inArray(instruments.segment, ['NSE_EQ','NSE_FO','NSE_INDEX'])
              )
            );

        const toDeactivate: string[] = [];

        // 2. Calculate Diff (DB - Synced)
        for (const row of activeInDb) {
            if (!syncedTokens.has(row.token)) {
                toDeactivate.push(row.token);
            }
        }

        logger.info({ 
            activeInDb: activeInDb.length, 
            synced: syncedTokens.size,
            toDeactivate: toDeactivate.length 
        }, 'Diff calculation complete');

        if (toDeactivate.length === 0) {
            return 0;
        }

        // 3. Batch Deactivate
        // Update 1000 at a time to avoid SQL parameter limits
        let deactivatedCount = 0;
        const CHUNK_SIZE = 1000;

        for (let i = 0; i < toDeactivate.length; i += CHUNK_SIZE) {
            const batch = toDeactivate.slice(i, i + CHUNK_SIZE);
            await db
                .update(instruments)
                .set({ isActive: false })
                .where(inArray(instruments.instrumentToken, batch));
            
            deactivatedCount += batch.length;
        }

        return deactivatedCount;

    } catch (err) {
        logger.error({ err }, 'Deactivation failed');
        return 0;
    }
}

/**
 * MAIN SYNC
 */
export async function syncInstruments(): Promise<SyncReport> {
  if (!SyncLock.acquire()) {
    throw new ApiError('Sync already running', 409, 'SYNC_LOCKED');
  }

  const startTime = new Date();

  try {
    logger.info('Starting instrument sync (Token-Diff Strategy)');

    // 1. Download
    const raw = await downloadInstruments();

    // 2. Parse & Normalize
    const parsed: ParsedInstrument[] = [];
    let invalid = 0;
    const currentTokens = new Set<string>();

    for (const r of raw) {
      const p = normalize(r, startTime);
      if (p) {
          parsed.push(p);
          currentTokens.add(p.instrumentToken);
      } else {
          invalid++;
      }
    }

    // 3. CRITICAL SAFETY BREAK
    if (parsed.length < MIN_SAFETY_COUNT) {
        throw new Error(`SAFETY ABORT: Parsed count ${parsed.length} is below safety threshold ${MIN_SAFETY_COUNT}. Upstream data may be corrupted.`);
    }

    logger.info({
      valid: parsed.length,
      invalid,
      filter: 'NSE_EQ, NSE_FO, NSE_INDEX'
    }, 'Normalization passed safety check');

    const futuresCount = parsed.filter((p) => p.instrumentType === 'FUTURE').length;
    logger.info(
      {
        futuresCount,
        minFuturesCount: MIN_FUTURES_COUNT,
      },
      'Futures normalization guard check'
    );

    if (futuresCount < MIN_FUTURES_COUNT) {
        throw new Error(
            `FATAL: Futures normalization failure detected. Only ${futuresCount} futures parsed (min required: ${MIN_FUTURES_COUNT}). Aborting sync.`
        );
    }

    // 4. Upsert Verified Data
    await bulkUpsert(parsed);

    // 5. Deactivate Missing (Diff)
    const deactivated = await deactivateMissing(currentTokens);
    
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    logger.info('Instrument sync COMPLETE');

    return {
      totalProcessed: parsed.length + invalid,
      upserted: parsed.length,
      updated: 0, 
      deactivated,
      errors: invalid,
      duration,
      startTime,
      endTime,
    };
  } catch (err) {
    logger.error({ err }, 'Sync failed');
    throw err;
  } finally {
    SyncLock.release();
  }
}
