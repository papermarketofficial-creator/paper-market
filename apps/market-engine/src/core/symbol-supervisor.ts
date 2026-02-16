// UpstoxWebSocket will be imported from the upstox directory
import type { UpstoxWebSocket } from '../upstox/websocket.js';

// ═══════════════════════════════════════════════════════════
// 📊 SYMBOL SUPERVISOR: Reference-counted subscription manager
// ═══════════════════════════════════════════════════════════

export class SymbolSupervisor {
    private active = new Map<string, number>(); // symbol → ref count
    private unsubTimer = new Map<string, NodeJS.Timeout>();
    
    // 🔥 CRITICAL FIX #2: Micro-batching to prevent burst throttling
    private pending = new Set<string>();
    private flushTimer: NodeJS.Timeout | null = null;
    private ws: UpstoxWebSocket;
    
    constructor(ws: UpstoxWebSocket) {
        this.ws = ws;
    }
    
    /**
     * Add a reference to a symbol
     * First reference → batched upstream subscription
     */
    add(symbol: string) {
        const count = this.active.get(symbol) ?? 0;
        this.active.set(symbol, count + 1);
        
        // Clear pending unsubscribe
        const timer = this.unsubTimer.get(symbol);
        if (timer) {
            clearTimeout(timer);
            this.unsubTimer.delete(symbol);
        }
        
        // First subscriber → batch subscribe
        if (count === 0) {
            this.pending.add(symbol);
            
            // 🔥 Batch subscriptions within 50ms window
            // This prevents broker throttling during subscription storms
            if (!this.flushTimer) {
                this.flushTimer = setTimeout(() => {
                    const batch = Array.from(this.pending);
                    
                    if (batch.length > 0) {
                        this.ws.subscribe(batch); // Batch call!
                        console.log(`🔔 Subscribed (batch ${batch.length}): ${batch.join(', ')}`);
                    }
                    
                    this.pending.clear();
                    this.flushTimer = null;
                }, 50); // 50ms batching window
            }
        } else {
            console.log(`🔔 Ref++ ${symbol} (count: ${count + 1})`);
        }
    }
    
    /**
     * Remove a reference to a symbol
     * Last reference → delayed upstream unsubscribe
     */
    remove(symbol: string) {
        const count = this.active.get(symbol) ?? 0;
        
        if (count <= 1) {
            // Delayed unsubscribe (avoid thrashing)
            this.unsubTimer.set(symbol, setTimeout(() => {
                this.active.delete(symbol);
                this.ws.unsubscribe([symbol]);
                console.log(`🔕 Unsubscribed: ${symbol}`);
            }, 5000)); // 5s grace period
        } else {
            this.active.set(symbol, count - 1);
            console.log(`🔕 Ref-- ${symbol} (count: ${count - 1})`);
        }
    }
    
    /**
     * Get all actively subscribed symbols
     */
    getActiveSymbols(): string[] {
        return Array.from(this.active.keys());
    }
    
    /**
     * Get ref count for a symbol
     */
    getRefCount(symbol: string): number {
        return this.active.get(symbol) ?? 0;
    }
    
    /**
     * Flush pending subscriptions immediately (for shutdown)
     */
    flushPending() {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        
        if (this.pending.size > 0) {
            const batch = Array.from(this.pending);
            this.ws.subscribe(batch);
            console.log(`🔔 Flushed pending (${batch.length}): ${batch.join(', ')}`);
            this.pending.clear();
        }
    }
}
