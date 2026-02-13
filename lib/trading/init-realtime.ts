import { tickBus } from '@/lib/trading/tick-bus';
import { candleEngine } from '@/lib/trading/candle-engine';
import { chartRegistry } from '@/lib/trading/chart-registry';

// ═══════════════════════════════════════════════════════════
// 🔌 SUBSCRIBE CANDLE ENGINE TO TICK BUS
// ═══════════════════════════════════════════════════════════
/**
 * Subscribe CandleEngine to process ticks for 1-minute candles
 * (Can be extended to support multiple intervals)
 */
function initializeCandleEngineSubscription() {
    console.log("🔌 Subscribing CandleEngine to TickBus...");
    
    tickBus.on('tick', (tick) => {
        // Process tick for 1-minute candles (60 seconds)
        const candleUpdate = candleEngine.processTick(tick, 60);
        
        if (candleUpdate) {
            // ═══════════════════════════════════════════════════════════
            // 🛠️ SINGLE-WRITER PATTERN: Direct chart update
            // ═══════════════════════════════════════════════════════════
            // CandleEngine → ChartRegistry → ChartController
            // Bypasses React/Zustand entirely for live updates
            const controller = chartRegistry.get(candleUpdate.instrumentKey);
            if (controller) {
                controller.updateCandle(candleUpdate.candle);
            }
        }
        
        // Future: Support multiple intervals
        // candleEngine.processTick(tick, 300); // 5-minute
        // candleEngine.processTick(tick, 900); // 15-minute
    });
    
    console.log("✅ CandleEngine subscribed to TickBus");
}

// ═══════════════════════════════════════════════════════════
// 🚀 AUTO-INITIALIZE ON MODULE LOAD
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// 🚀 AUTO-INITIALIZE ON MODULE LOAD
// ═══════════════════════════════════════════════════════════
declare global {
    var __candleEngineInitialized: boolean | undefined;
}

if (!globalThis.__candleEngineInitialized) {
    globalThis.__candleEngineInitialized = true;
    initializeCandleEngineSubscription();
    
    // 📊 METRICS LOCK: Monitor listener count (Target: 1)
    console.log("📊 TickBus 'tick' listeners:", tickBus.listenerCount('tick'));
} else {
    console.log("♻️ CandleEngine already subscribed (Skipping re-init)");
}

// Export for manual control if needed
export { initializeCandleEngineSubscription };
