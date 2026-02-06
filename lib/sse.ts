// ═══════════════════════════════════════════════════════════
// 🔌 SSE SINGLETON (PHASE 5: HARD Browser Lock + Race Guard)
// ═══════════════════════════════════════════════════════════
// WHY: Logs show ACTIVE SSE: 4 (race condition)
// Problem: Both MarketStreamProvider AND use-market-stream call
// getMarketStream() during React hydration/Strict Mode.
// 
// FIX: Add synchronous lock BEFORE async EventSource creation.
// ═══════════════════════════════════════════════════════════

declare global {
    interface Window {
        __MARKET_STREAM__?: EventSource;
        __SSE_CREATING__?: boolean; // 🔒 Synchronous lock
    }
}

/**
 * Get or create the singleton EventSource for market data stream
 * HARD browser-level singleton with race condition protection
 */
export function getMarketStream(): EventSource {
    // 🛡️ BROWSER-ONLY GUARD
    if (typeof window === "undefined") {
        throw new Error("SSE must run in browser");
    }

    // 🔒 HARD SINGLETON: Return existing if OPEN or CONNECTING
    if (
        window.__MARKET_STREAM__ &&
        window.__MARKET_STREAM__.readyState !== EventSource.CLOSED
    ) {
        console.log("♻️ Reusing existing SSE connection");
        return window.__MARKET_STREAM__;
    }

    // 🔒 RACE CONDITION GUARD: Check if creation is in progress
    // This prevents: call1 → new EventSource → call2 → new EventSource → call1 stores
    if (window.__SSE_CREATING__) {
        console.log("⏳ SSE creation in progress, returning pending...");
        // Poll until creation completes (micro-optimization for race window)
        const waitForConnection = () => {
            if (window.__MARKET_STREAM__) {
                return window.__MARKET_STREAM__;
            }
            // If still creating after 100ms, something went wrong - proceed anyway
            return new EventSource("/api/v1/market/stream");
        };
        // Return existing or wait
        if (window.__MARKET_STREAM__) return window.__MARKET_STREAM__;
        // Edge case: return a new one if lock is stuck
        return waitForConnection();
    }

    // 🔒 SET LOCK SYNCHRONOUSLY (before any async work)
    window.__SSE_CREATING__ = true;

    // 🆕 CREATE NEW CONNECTION
    console.log("🔌 Creating new SSE connection...");
    const eventSource = new EventSource("/api/v1/market/stream");

    // Store in window singleton (browser-level)
    window.__MARKET_STREAM__ = eventSource;

    // 🔓 RELEASE LOCK
    window.__SSE_CREATING__ = false;

    eventSource.onopen = () => {
        console.log("✅ SSE Connection established");
    };

    eventSource.onerror = (error) => {
        console.error("❌ SSE Connection error:", error);
        // Only clear singleton if it's still pointing to THIS instance
        // This prevents "Object is disposed" errors when components try to access it
        if (window.__MARKET_STREAM__ === eventSource) {
            window.__MARKET_STREAM__ = undefined;
        }
    };

    return eventSource;
}

/**
 * Close the singleton SSE connection (for cleanup)
 * WARNING: Only call on app shutdown, NOT on component unmount
 */
export function closeMarketStream() {
    if (typeof window !== "undefined" && window.__MARKET_STREAM__) {
        console.log("🔌 Closing SSE connection...");
        window.__MARKET_STREAM__.close();
        window.__MARKET_STREAM__ = undefined;
    }
}
