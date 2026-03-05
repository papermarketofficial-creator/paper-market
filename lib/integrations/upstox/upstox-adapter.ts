import { NormalizedTick } from '@/lib/trading/tick-bus';

function extractLtpc(feed: any): any | null {
    return (
        feed?.ltpc ??
        feed?.ff?.ltpc ??
        feed?.fullFeed?.marketFF?.ltpc ??
        feed?.fullFeed?.indexFF?.ltpc ??
        feed?.ff?.marketFF?.ltpc ??
        feed?.ff?.indexFF?.ltpc ??
        feed?.firstLevelWithGreeks?.ltpc ??
        feed?.ff?.firstLevelWithGreeks?.ltpc ??
        null
    );
}

// ═══════════════════════════════════════════════════════════
// 🔌 UPSTOX ADAPTER: Normalize Upstox-specific data format
// ═══════════════════════════════════════════════════════════
/**
 * UpstoxAdapter converts Upstox WebSocket feed format to NormalizedTick.
 * 
 * Why: Enables broker-agnostic core engine. Easy to add Zerodha, Angel One, etc.
 * 
 * Upstox Format:
 * ```json
 * {
 *   "feeds": {
 *     "NSE_EQ|INE002A01018": {
 *       "ltpc": {
 *         "ltp": 2500,
 *         "ltt": "1769935964834",
 *         "ltq": 100,
 *         "cp": 2480,
 *         "vol": 1000
 *       }
 *     }
 *   }
 * }
 * ```
 */
export class UpstoxAdapter {
    private isinMap: Map<string, string>; // ISIN → Trading Symbol
    
    constructor(isinMap: Map<string, string>) {
        this.isinMap = isinMap;
    }

    /**
     * Normalize Upstox feed data to NormalizedTick
     */
    normalize(upstoxData: any): NormalizedTick[] {
        const ticks: NormalizedTick[] = [];
        
        // Guard against invalid data
        if (!upstoxData || typeof upstoxData !== 'object') {
            return ticks;
        }

        const feeds = upstoxData.feeds || {};
        
        for (const key of Object.keys(feeds)) {
            const feed = feeds[key];
            const ltpc = extractLtpc(feed);
            const ltp = Number(ltpc?.ltp);
            
            if (!ltpc || !Number.isFinite(ltp) || ltp <= 0) continue;
            
            // ═══════════════════════════════════════════════════════════
            // 🛠️ SYMBOL RESOLUTION: ISIN → Trading Symbol
            // ═══════════════════════════════════════════════════════════
            // key format: "NSE_EQ|INE002A01018"
            const parts = key.split('|');
            const exchange = parts[0] || 'NSE';
            const isin = parts[1] || key;
            const instrumentKey = key.replace(':', '|');
            
            // Resolve ISIN to trading symbol (e.g., INE002A01018 → RELIANCE)
            const symbol = this.isinMap.get(isin) || isin;
            
            // ═══════════════════════════════════════════════════════════
            // 🛠️ TIMESTAMP NORMALIZATION: Milliseconds → Seconds
            // ═══════════════════════════════════════════════════════════
            let timestamp = Date.now() / 1000; // Default to now
            if (ltpc.ltt) {
                const ltt = Number(ltpc.ltt);
                // If timestamp is in milliseconds (13 digits), convert to seconds
                timestamp = ltt.toString().length === 13 
                    ? Math.floor(ltt / 1000) 
                    : ltt;
            }
            
            const tick: NormalizedTick = {
                instrumentKey,
                symbol,
                price: ltp,
                volume: Number(ltpc.vol ?? ltpc.ltq ?? 0) || 0,
                timestamp,
                exchange,
                close: Number(ltpc.cp) || undefined
            };
            
            ticks.push(tick);
        }
        
        return ticks;
    }
}
