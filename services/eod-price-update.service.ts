import { db } from '@/lib/db';
import { instruments } from '@/lib/db/schema';
import { UpstoxService } from './upstox.service';
import { logger } from '@/lib/logger';
import { eq } from 'drizzle-orm';

export class EODPriceUpdateService {
  /**
   * Update lastPrice for all active instruments
   * Called daily after market close (4:00 PM IST)
   */
  static async updateAllPrices(): Promise<{
    success: boolean;
    updated: number;
    failed: number;
    errors: string[];
  }> {
    const startTime = Date.now();
    logger.info('🕐 Starting EOD price update...');

    try {
      // 1. Fetch all active instruments
      const activeInstruments = await db
        .select({
          instrumentToken: instruments.instrumentToken,
          tradingsymbol: instruments.tradingsymbol,
        })
        .from(instruments)
        .where(eq(instruments.isActive, true));

      logger.info({ count: activeInstruments.length }, 'Fetched active instruments');

      if (activeInstruments.length === 0) {
        return { success: true, updated: 0, failed: 0, errors: [] };
      }

      // 2. Batch fetch quotes (Upstox allows ~500 symbols per request)
      const BATCH_SIZE = 500;
      const batches: string[][] = [];
      
      for (let i = 0; i < activeInstruments.length; i += BATCH_SIZE) {
        batches.push(
          activeInstruments
            .slice(i, i + BATCH_SIZE)
            .map(inst => inst.instrumentToken)
        );
      }

      let updated = 0;
      let failed = 0;
      const errors: string[] = [];

      // 3. Process each batch
      for (const [index, batch] of batches.entries()) {
        logger.info({ batch: index + 1, total: batches.length }, 'Processing batch');

        try {
          const quotes = await UpstoxService.getSystemQuotes(batch);
          
          // ═══════════════════════════════════════════════════════════
          // 🔄 MAP RESPONSE KEYS: Upstox returns "NSE_EQ:SYMBOL" but we sent "NSE_EQ|ISIN"
          // ═══════════════════════════════════════════════════════════
          // Create a mapping from trading symbol to instrument token
          const symbolToToken = new Map<string, string>();
          const normalizedSymbolToToken = new Map<string, string>();
          
          for (const inst of activeInstruments) {
            // Exact match
            symbolToToken.set(inst.tradingsymbol, inst.instrumentToken);
            
            // Normalized match (remove spaces, convert to uppercase)
            const normalized = inst.tradingsymbol.replace(/\s+/g, '').toUpperCase();
            normalizedSymbolToToken.set(normalized, inst.instrumentToken);
          }

          // 4. Update database using correct instrument tokens
          for (const [upstoxKey, price] of Object.entries(quotes)) {
            try {
              // Extract symbol from Upstox key (e.g., "NSE_EQ:RELIANCE" -> "RELIANCE")
              const symbol = upstoxKey.split(':')[1] || upstoxKey.split('|')[1];
              
              // Try exact match first
              let instrumentToken = symbolToToken.get(symbol);
              
              // If no exact match, try normalized (for symbols with spaces like "Nifty Bank")
              if (!instrumentToken) {
                const normalized = symbol.replace(/\s+/g, '').toUpperCase();
                instrumentToken = normalizedSymbolToToken.get(normalized);
              }

              // Manual overrides for known mismatches
              if (!instrumentToken) {
                const manualUpdates: Record<string, string> = {
                  'TMPV': 'TATAMOTORS',
                  'NIFTYBANK': 'NIFTY BANK',
                  'NIFTY50': 'NIFTY 50',
                  'NIFTYFINSERVICE': 'NIFTY FIN SERVICE'
                };
                
                const targetSymbol = manualUpdates[symbol] || manualUpdates[symbol.toUpperCase()];
                if (targetSymbol) {
                  instrumentToken = symbolToToken.get(targetSymbol);
                }
              }

              if (!instrumentToken) {
                logger.warn({ upstoxKey, symbol, availableSymbols: Array.from(symbolToToken.keys()).slice(0, 5) }, 'No mapping found for symbol');
                failed++;
                errors.push(`${upstoxKey}: No matching instrument in database (extracted symbol: ${symbol})`);
                continue;
              }

              const result = await db
                .update(instruments)
                .set({
                  lastPrice: price.toString(),
                  updatedAt: new Date(),
                })
                .where(eq(instruments.instrumentToken, instrumentToken))
                .returning({ instrumentToken: instruments.instrumentToken });

              if (result.length > 0) {
                updated++;
              } else {
                failed++;
                errors.push(`${instrumentToken}: No matching row found in database`);
                logger.warn({ instrumentToken }, 'No row found for update');
              }
            } catch (err: any) {
              failed++;
              errors.push(`${upstoxKey}: ${err.message}`);
              logger.error({ err, upstoxKey }, 'Update failed for instrument');
            }
          }

          // Rate limiting: Wait 1 second between batches
          if (index < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (err: any) {
          logger.error({ err, batch: index }, 'Batch fetch failed');
          failed += batch.length;
          errors.push(`Batch ${index}: ${err.message}`);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(
        { updated, failed, duration: `${duration}ms` },
        '✅ EOD price update completed'
      );

      // ═══════════════════════════════════════════════════════════
      // 🔄 INVALIDATE CACHE: Force fresh data on next watchlist load
      // ═══════════════════════════════════════════════════════════
      const { cache } = await import('@/lib/cache');
      const keys = cache.keys();
      let clearedCount = 0;
      for (const key of keys) {
        if (key.startsWith('watchlist:')) {
          cache.delete(key);
          clearedCount++;
        }
      }
      console.log(`🗑️ Cleared ${clearedCount} watchlist cache entries`);

      return { success: true, updated, failed, errors };
    } catch (error: any) {
      logger.error({ err: error }, '❌ EOD price update failed');
      return {
        success: false,
        updated: 0,
        failed: 0,
        errors: [error.message],
      };
    }
  }
}
