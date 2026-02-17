import { chartRegistry } from '@/lib/trading/chart-registry';
import { getMarketWebSocket } from '@/lib/market-ws';

// ═══════════════════════════════════════════════════════════
// 🔌 SUBSCRIBE TO CANDLE UPDATES FROM MARKET-ENGINE
// ═══════════════════════════════════════════════════════════
/**
 * Subscribe to candle updates from market-engine WebSocket
 * and update charts directly via ChartRegistry
 * 
 * NOTE: This replaces the old TickBus → CandleEngine → ChartRegistry flow.
 * Now: market-engine → WebSocket → ChartRegistry
 */
function initializeCandleSubscription() {
    console.log("🔌 Subscribing to candle updates from market-engine...");
    
    const wsUrl = process.env.NEXT_PUBLIC_MARKET_ENGINE_WS_URL || 'ws://localhost:4200';
    
    const ws = getMarketWebSocket({
        url: wsUrl,
        onCandle: (candleData) => {
            const { candle, instrumentKey } = candleData;
            
            // ═══════════════════════════════════════════════════════════
            // 🛠️ SINGLE-WRITER PATTERN: Direct chart update
            // ═══════════════════════════════════════════════════════════
            // market-engine → WebSocket → ChartRegistry → ChartController
            // Bypasses React/Zustand entirely for live updates
            const controller = chartRegistry.get(instrumentKey);
            if (controller) {
                controller.updateCandle(candle);
            }
        }
    });
    
    // Note: Connection is handled by use-market-stream hook
    // This just registers the candle handler
    
    console.log("✅ Candle subscription initialized");
}

// ═══════════════════════════════════════════════════════════
// 🚀 AUTO-INITIALIZE ON MODULE LOAD
// ═══════════════════════════════════════════════════════════
declare global {
    var __candleSubscriptionInitialized: boolean | undefined;
}

if (!globalThis.__candleSubscriptionInitialized) {
    globalThis.__candleSubscriptionInitialized = true;
    initializeCandleSubscription();
} else {
    console.log("♻️ Candle subscription already initialized (Skipping re-init)");
}

// Export for manual control if needed
export { initializeCandleSubscription };
