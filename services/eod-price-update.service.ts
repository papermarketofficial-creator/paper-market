import { db } from '@/lib/db';
import { instruments } from '@/lib/db/schema';
import { UpstoxService } from './upstox.service';
import { logger } from '@/lib/logger';
import { eq } from 'drizzle-orm';

export class EODPriceUpdateService {
  /**
   * Fetches EOD snapshots from Upstox and warms cache only.
   * No instrument price fields are persisted in DB.
   */
  static async updateAllPrices(): Promise<{
    success: boolean;
    updated: number;
    failed: number;
    errors: string[];
  }> {
    const startTime = Date.now();
    logger.info('Starting EOD quote refresh (Upstox source only)...');

    try {
      const activeInstruments = await db
        .select({
          instrumentToken: instruments.instrumentToken,
        })
        .from(instruments)
        .where(eq(instruments.isActive, true));

      if (activeInstruments.length === 0) {
        return { success: true, updated: 0, failed: 0, errors: [] };
      }

      const BATCH_SIZE = 500;
      const batches: string[][] = [];
      for (let i = 0; i < activeInstruments.length; i += BATCH_SIZE) {
        batches.push(
          activeInstruments
            .slice(i, i + BATCH_SIZE)
            .map((inst) => inst.instrumentToken)
        );
      }

      let updated = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const [index, batch] of batches.entries()) {
        try {
          const quotes = await UpstoxService.getSystemQuoteDetails(batch);
          const seen = new Set<string>();

          for (const key of batch) {
            const detail =
              quotes[key] ||
              quotes[key.replace('|', ':')];
            const lastPrice = Number(detail?.lastPrice);
            if (Number.isFinite(lastPrice) && lastPrice > 0) {
              updated++;
              seen.add(key);
            }
          }

          failed += Math.max(0, batch.length - seen.size);
        } catch (error: any) {
          failed += batch.length;
          errors.push(`Batch ${index + 1}: ${error?.message || 'unknown error'}`);
          logger.error({ err: error, batch: index + 1 }, 'EOD batch quote fetch failed');
        }
      }

      const duration = Date.now() - startTime;
      logger.info(
        { updated, failed, duration: `${duration}ms` },
        'EOD quote refresh completed'
      );

      return { success: true, updated, failed, errors };
    } catch (error: any) {
      logger.error({ err: error }, 'EOD quote refresh failed');
      return {
        success: false,
        updated: 0,
        failed: 0,
        errors: [error?.message || 'unknown error'],
      };
    }
  }
}
