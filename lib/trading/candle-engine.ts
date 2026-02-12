import { CandlestickData, Time } from 'lightweight-charts';
import { NormalizedTick } from './tick-bus';
import { EventEmitter } from 'events';

// ═══════════════════════════════════════════════════════════
// 📊 CANDLE CONTEXT: Per-symbol+interval state isolation
// ═══════════════════════════════════════════════════════════
interface CandleContext {
    currentCandle: CandlestickData | null;
    lastBucket: number;      // Last time bucket processed
    interval: number;        // Interval in seconds (60, 300, 900, etc.)
    symbol: string;
}

// ═══════════════════════════════════════════════════════════
// 📈 CANDLE UPDATE RESULT
// ═══════════════════════════════════════════════════════════
export interface CandleUpdate {
    type: 'new' | 'update';
    candle: CandlestickData;
    symbol: string;
    interval: number;
}

// ═══════════════════════════════════════════════════════════
// 🏭 CANDLE ENGINE: Professional tick aggregation
// ═══════════════════════════════════════════════════════════
/**
 * CandleEngine converts ticks into candles with stateless per-symbol contexts.
 * 
 * Key Features:
 * - Stateless per-symbol+interval contexts (prevents corruption on timeframe switch)
 * - Timestamp normalization (milliseconds → seconds)
 * - Gap-aware candle detection (handles market breaks)
 * - Bucket alignment (candles start at interval boundaries)
 * 
 * Architecture:
 * ```
 * TickBus → CandleEngine.processTick() → { type, candle }
 *                                          ↓
 *                                    ChartController.updateCandle()
 * ```
 */
export class CandleEngine extends EventEmitter {
    private contexts = new Map<string, CandleContext>();

    /**
     * Reset candle context for a symbol (used when switching timeframes)
     */
    reset(symbol: string, interval?: number) {
        if (interval) {
            const key = `${symbol}:${interval}`;
            this.contexts.delete(key);
            if (process.env.DEBUG_MARKET === 'true') console.log(`🔄 Reset candle context: ${key}`);
        } else {
            // Reset all intervals for this symbol
            let count = 0;
            for (const key of this.contexts.keys()) {
                if (key.startsWith(`${symbol}:`)) {
                    this.contexts.delete(key);
                    count++;
                }
            }
            if (process.env.DEBUG_MARKET === 'true') console.log(`🔄 Reset ${count} candle contexts for ${symbol}`);
        }
    }

    /**
     * Process a tick and return candle update instruction
     */
    processTick(tick: NormalizedTick, interval: number = 60): CandleUpdate | null {
        // ═══════════════════════════════════════════════════════════
        // 🛠️ CONTEXT ISOLATION: Per-symbol+interval
        // ═══════════════════════════════════════════════════════════
        const key = `${tick.symbol}:${interval}`;
        let ctx = this.contexts.get(key);

        // ═══════════════════════════════════════════════════════════
        // 🛠️ GUARD: Stale Tick Detection
        // ═══════════════════════════════════════════════════════════
        // Prevent processing ticks older than current candle start
        if (ctx?.currentCandle) {
             const candleStartTime = ctx.currentCandle.time as number;
             // We normalize tick timestamp to seconds inside this function later, 
             // but we need to check raw timestamp against normalized candle time carefully.
             // tick.timestamp is passed as "seconds" according to NormalizedTick interface?
             // Let's check NormalizedTick definition. 
             // Yes, NormalizedTick.timestamp is SECONDS.
             
             if (tick.timestamp < candleStartTime) {
                 if (process.env.DEBUG_MARKET === 'true') {
                     console.warn(`⚠️ Stale tick ignored: ${tick.symbol} @ ${tick.timestamp} < ${candleStartTime}`);
                 }
                 return null;
             }
        }

        if (!ctx) {
            ctx = {
                currentCandle: null,
                lastBucket: 0,
                interval,
                symbol: tick.symbol
            };
            this.contexts.set(key, ctx);
        }

        // ═══════════════════════════════════════════════════════════
        // 🛠️ TIMESTAMP NORMALIZATION: Ensure seconds
        // ═══════════════════════════════════════════════════════════
        let tickTimeSeconds = tick.timestamp;
        if (tickTimeSeconds > 1e12) {
    tickTimeSeconds = Math.floor(tickTimeSeconds / 1000);
}


        // ═══════════════════════════════════════════════════════════
        // 🛠️ BUCKET ALIGNMENT: Align to interval boundary
        // ═══════════════════════════════════════════════════════════
        const tickBucket = Math.floor(tickTimeSeconds / interval);
        const alignedTime = tickBucket * interval;

        // ═══════════════════════════════════════════════════════════
        // 🛠️ GAP-AWARE DETECTION: Handle market breaks
        // ═══════════════════════════════════════════════════════════
        const MAX_GAP = interval * 5; // 5 candles
        let isNewCandle = false;

        if (!ctx.currentCandle) {
            // First candle for this context
            isNewCandle = true;
        } else if (tickBucket > ctx.lastBucket) {
            // Check if gap is too large (market was closed)
            const timeDiff = tickTimeSeconds - (ctx.lastBucket * interval);
            if (timeDiff >= MAX_GAP) {
                if (process.env.DEBUG_MARKET === 'true') console.log(`⚠️ Large gap detected for ${tick.symbol}: ${timeDiff}s (market was closed)`);
            }
            isNewCandle = true;
        }

        if (isNewCandle) {
            // ═══════════════════════════════════════════════════════════
            // 🆕 NEW CANDLE
            // ═══════════════════════════════════════════════════════════
            const newCandle: CandlestickData = {
                time: alignedTime as Time,
                open: tick.price,
                high: tick.price,
                low: tick.price,
                close: tick.price
            };

            ctx.currentCandle = newCandle;
            ctx.lastBucket = tickBucket;

            // Sample logging (10% of new candles)
            if (process.env.DEBUG_MARKET === 'true' && Math.random() < 0.1) {
                console.log(`✅ NEW Candle: ${tick.symbol} @ ${new Date(alignedTime * 1000).toISOString()}`);
            }

            const result: CandleUpdate = {
                type: 'new',
                candle: newCandle,
                symbol: tick.symbol,
                interval
            };

            // Emit event for subscribers
            this.emit('candle', result);

            return result;
        } else {
            // ═══════════════════════════════════════════════════════════
            // 🔄 UPDATE EXISTING CANDLE
            // ═══════════════════════════════════════════════════════════
            const updated: CandlestickData = {
                ...ctx.currentCandle!,
                close: tick.price,
                high: Math.max(ctx.currentCandle!.high as number, tick.price),
                low: Math.min(ctx.currentCandle!.low as number, tick.price)
            };

            ctx.currentCandle = updated;

            // Sample logging (1% of updates to avoid spam)
            if (process.env.DEBUG_MARKET === 'true' && Math.random() < 0.01) {
                console.log(`📈 UPDATE: ${tick.symbol} O${updated.open} H${updated.high} L${updated.low} C${updated.close}`);
            }

            const result: CandleUpdate = {
                type: 'update',
                candle: updated,
                symbol: tick.symbol,
                interval
            };

            // Emit event for subscribers
            this.emit('candle', result);

            return result;
        }
    }

    /**
     * Get current candle for a symbol+interval
     */
    getCurrentCandle(symbol: string, interval: number = 60): CandlestickData | null {
        const key = `${symbol}:${interval}`;
        const ctx = this.contexts.get(key);
        return ctx?.currentCandle || null;
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            activeContexts: this.contexts.size,
            contexts: Array.from(this.contexts.keys())
        };
    }
}

// ═══════════════════════════════════════════════════════════
// 🛠️ EXPORT SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// 🛠️ EXPORT SINGLETON INSTANCE (Global-Safe)
// ═══════════════════════════════════════════════════════════
const globalForCandleEngine = globalThis as unknown as { __candleEngine: CandleEngine };

export const candleEngine = globalForCandleEngine.__candleEngine || new CandleEngine();

if (process.env.NODE_ENV !== 'production') {
    globalForCandleEngine.__candleEngine = candleEngine;
}
