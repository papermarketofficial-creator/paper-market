import { EventEmitter } from 'events';

// ═══════════════════════════════════════════════════════════
// 🎯 NORMALIZED TICK: Broker-agnostic tick format
// ═══════════════════════════════════════════════════════════
export interface NormalizedTick {
    symbol: string;          // Trading symbol (e.g., "RELIANCE")
    price: number;           // Last traded price
    volume: number;          // Volume (if available)
    timestamp: number;       // Unix timestamp in SECONDS (not milliseconds)
    exchange: string;        // Exchange (e.g., "NSE", "BSE")
    close?: number;          // Previous close for change calculation
}

// ═══════════════════════════════════════════════════════════
// 🚌 TICK BUS: Event-driven tick distribution
// ═══════════════════════════════════════════════════════════
/**
 * TickBus is the central event hub for market data distribution.
 * 
 * Architecture:
 * ```
 * WebSocket → Adapter → TickBus.emit('tick')
 *                          ↓
 *                          ├─→ CandleEngine
 *                          ├─→ Watchlist
 *                          ├─→ IndicatorEngine
 *                          └─→ Recorder
 * ```
 * 
 * Why: Decouples tick sources from consumers, enabling modular growth.
 */
/**
 * TickBus is the central event hub for market data distribution.
 * 
 * Architecture:
 * ```
 * WebSocket → Adapter → TickBus.emit('tick')
 *                          ↓
 *                          ├─→ CandleEngine
 *                          ├─→ Watchlist
 *                          ├─→ IndicatorEngine
 *                          └─→ Recorder
 * ```
 * 
 * Why: Decouples tick sources from consumers, enabling modular growth.
 * 
 * 🔄 UPDATE: Replaced EventEmitter with micro-event bus for fault isolation.
 * If one listener fails, others continue unaffected.
 */
class TickBus {
    private listeners = new Set<(tick: NormalizedTick) => void>();
    private tickCount = 0;
    private symbolCounts = new Map<string, number>();

    /**
     * Subscribe to tick events
     */
    on(event: 'tick', handler: (tick: NormalizedTick) => void): void {
        this.listeners.add(handler);
    }

    /**
     * Unsubscribe from tick events
     */
    off(event: 'tick', handler: (tick: NormalizedTick) => void): void {
        this.listeners.delete(handler);
    }

    /**
     * Emit a normalized tick to all subscribers
     * Uses queueMicrotask for non-blocking execution and fault isolation
     */
    emitTick(tick: NormalizedTick) {
        this.tickCount++;
        
        // Track per-symbol counts
        const count = this.symbolCounts.get(tick.symbol) || 0;
        this.symbolCounts.set(tick.symbol, count + 1);

        // Emit to all subscribers safely
        this.listeners.forEach(handler => {
            queueMicrotask(() => {
                try {
                    handler(tick);
                } catch (error) {
                    // Log error but don't crash other listeners
                    console.error('❌ TickBus listener error:', error);
                }
            });
        });

        // Sample logging (1% of ticks to avoid spam)
        if (process.env.DEBUG_MARKET === 'true' && this.tickCount % 100 === 0) {
            console.log(`📊 TickBus: ${this.tickCount} total ticks processed`);
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            totalTicks: this.tickCount,
            symbolCounts: Object.fromEntries(this.symbolCounts),
            activeListeners: this.listeners.size
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.tickCount = 0;
        this.symbolCounts.clear();
    }
}

// ═══════════════════════════════════════════════════════════
// 🛠️ EXPORT SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// 🛠️ EXPORT SINGLETON INSTANCE (Global-Safe)
// ═══════════════════════════════════════════════════════════
const globalForTickBus = globalThis as unknown as { __tickBus: TickBus };

export const tickBus = globalForTickBus.__tickBus || new TickBus();

if (process.env.NODE_ENV !== 'production') {
    globalForTickBus.__tickBus = tickBus;
}
