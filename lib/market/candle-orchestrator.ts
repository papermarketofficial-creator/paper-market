
// ═══════════════════════════════════════════════════════════
// 🎼 CANDLE ORCHESTRATOR: Pure Domain Logic Layer
// ═══════════════════════════════════════════════════════════
// Responsibilities:
// 1. Resolve full candle request parameters (Range -> Dates)
// 2. Route to UpstoxService (Single Authority)
// 3. Format response for Lightweight Charts
// 4. Enforce timezone safety (Asia/Kolkata)
// 
// ❌ CONSTRAINTS:
// - NO HTTP objects (NextRequest/NextResponse)
// - NO Auth checks (passed in)
// - NO Database calls (delegated to Service helpers)
// ═══════════════════════════════════════════════════════════

import { UpstoxService } from "@/services/upstox.service";
import { subDays, subMonths, subWeeks, subYears } from "date-fns";

export interface CandleFetchParams {
    instrumentKey: string;
    timeframe?: string; // Legacy: 1m, 5m, 1h, 1d
    range?: string;     // New: 1D, 5D, 1M, 3M, 6M, 1Y, 5Y
    toDate?: string;    // Pagination cursor (YYYY-MM-DD)
}

export interface FormattedCandle {
    time: number; // Unix seconds
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export interface FormattedVolume {
    time: number;
    value: number;
    color: string;
}

export interface CandleResult {
    candles: FormattedCandle[];
    volume: FormattedVolume[];
}

export class CandleOrchestrator {
    private static readonly TIMEZONE = 'Asia/Kolkata';

    /**
     * Main Entrypoint: Fetch and format candles
     */
    static async fetchCandles(params: CandleFetchParams): Promise<CandleResult> {
        const { unit, interval, fromDate, toDate } = this.resolveTimeParams(params);

        // ═══════════════════════════════════════════════════════════
        // 🚀 FETCH: Call Service (Single Authority)
        // ═══════════════════════════════════════════════════════════
        // TRICK: We don't merge History + Intraday manually anymore.
        // UpstoxService handles "1m + Today" routing internally.
        const rawCandles = await UpstoxService.getHistoricalCandleData(
            params.instrumentKey,
            unit,
            interval,
            fromDate,
            toDate
        );

        // ═══════════════════════════════════════════════════════════
        // 🎨 FORMAT: Domain -> Presentation
        // ═══════════════════════════════════════════════════════════
        // Upstox: [timestamp(ISO+Offset), open, high, low, close, volume, oi]
        // LWC: { time: unix_seconds, ... }
        
        // Debug first/last if needed (Env controlled)
        if (process.env.DEBUG_MARKET === 'true' && rawCandles.length > 0) {
            console.log(`🎻 Orchestrator: First ${rawCandles[0][0]}, Last ${rawCandles[rawCandles.length-1][0]}`);
        }

        const formattedCandles: FormattedCandle[] = rawCandles.map(c => ({
            time: new Date(c[0]).getTime() / 1000,
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
        }));

        const formattedVolume: FormattedVolume[] = rawCandles.map(c => ({
            time: new Date(c[0]).getTime() / 1000,
            value: c[5],
            color: c[4] >= c[1] ? '#22C55E' : '#EF4444' // Green if bullish
        }));

        return {
            candles: formattedCandles,
            volume: formattedVolume
        };
    }

    /**
     * Resolve legacy Timeframe/Range into strict API params
     * 🔥 NEW: Supports pagination via toDate cursor
     */
    private static resolveTimeParams(params: CandleFetchParams) {
        const { timeframe = '1m', range, toDate: cursorDate } = params;

        // ═══════════════════════════════════════════════════════════
        // 🔥 PAGINATION LOGIC: Distinguish initial load vs scroll
        // ═══════════════════════════════════════════════════════════
        // If cursorDate provided → we're paginating backwards (user scrolled left)
        // If no cursorDate → initial load (show most recent data)
        const isPaginating = !!cursorDate;
        const anchorDate = cursorDate ? new Date(cursorDate) : new Date();

        let unit = 'minutes';
        let interval = '1';
        let fromDateObj = new Date(anchorDate);
        let toDateStr = this.formatDateIST(anchorDate);

        // ═══════════════════════════════════════════════════════════
        // 🎯 RANGE-BASED RESOLUTION with Pagination Support
        // ═══════════════════════════════════════════════════════════
        if (range) {
            switch (range.toUpperCase()) {
                case '1D': 
                    unit = 'minutes'; interval = '1';
                    if (isPaginating) {
                        // Load 1 week chunks (API allows 1 month max for 1-minute)
                        fromDateObj = subDays(anchorDate, 7);
                        toDateStr = this.formatDateIST(anchorDate);
                    } else {
                        // 🔥 CRITICAL FIX: Fetch last 3 days to ensure we get at least 1 full trading day
                        // This handles:
                        // - Market closed (after hours)
                        // - Weekends
                        // - Holidays
                        // - Intraday endpoint returning empty data
                        // The historical endpoint will return whatever trading days exist in this range
                        fromDateObj = subDays(anchorDate, 3);
                        toDateStr = this.formatDateIST(anchorDate);
                    }
                    break;
                
                case '5D': 
                    unit = 'minutes'; interval = '5';
                    if (isPaginating) {
                        // Load 2 week chunks
                        fromDateObj = subDays(anchorDate, 14);
                        toDateStr = this.formatDateIST(anchorDate);
                    } else {
                        // Initial: Load last 5 days
                        fromDateObj = subDays(anchorDate, 5);
                    }
                    break;
                
                case '1M': 
                    unit = 'minutes'; interval = '15'; // ✅ Professional: 15-minute candles for 1 month
                    if (isPaginating) {
                        // Load 1 week chunks
                        fromDateObj = subDays(anchorDate, 7);
                        toDateStr = this.formatDateIST(anchorDate);
                    } else {
                        // Initial: Load last 1 month
                        fromDateObj = subMonths(anchorDate, 1);
                    }
                    break;

                case '3M':
                    // 🔥 NEW: 3 Month Range -> Daily Candles
                    unit = 'days'; interval = '1';
                    if (isPaginating) {
                        fromDateObj = subMonths(anchorDate, 1);
                        toDateStr = this.formatDateIST(anchorDate);
                    } else {
                        fromDateObj = subMonths(anchorDate, 3);
                    }
                    break;
                
                case '6M': 
                    unit = 'hours'; interval = '1'; // ✅ Professional: 1-hour candles for 6 months
                    if (isPaginating) {
                        // Load 1 month chunks (hourly data available for 3 months max)
                        fromDateObj = subMonths(anchorDate, 1);
                        toDateStr = this.formatDateIST(anchorDate);
                    } else {
                        // Initial: Load last 3 months (API limit for hourly)
                        fromDateObj = subMonths(anchorDate, 3);
                    }
                    break;
                
                case '1Y': 
                    unit = 'days'; interval = '1';
                    if (isPaginating) {
                        // Load 6 month chunks
                        fromDateObj = subMonths(anchorDate, 6);
                        toDateStr = this.formatDateIST(anchorDate);
                    } else {
                        // Initial: Load last 1 year
                        fromDateObj = subYears(anchorDate, 1);
                    }
                    break;

                case '3Y':
                    // 🔥 NEW: 3 Year Range -> Weekly Candles
                    unit = 'weeks'; interval = '1'; 
                    if (isPaginating) {
                        fromDateObj = subYears(anchorDate, 1);
                        toDateStr = this.formatDateIST(anchorDate);
                    } else {
                        fromDateObj = subYears(anchorDate, 3);
                    }
                    break;
                
                case '5Y': 
                    unit = 'weeks'; interval = '1'; // ✅ Professional: Weekly candles for 5 years (~260 candles)
                    if (isPaginating) {
                        // Load 1 year chunks
                        fromDateObj = subYears(anchorDate, 1);
                        toDateStr = this.formatDateIST(anchorDate);
                    } else {
                        // Initial: Load last 5 years
                        fromDateObj = subYears(anchorDate, 5);
                    }
                    break;
                
                default: 
                    unit = 'days'; interval = '1';
                    fromDateObj = subYears(anchorDate, 1);
            }
        } else {
            // ═══════════════════════════════════════════════════════════
            // 🕐 TIMEFRAME-BASED RESOLUTION (Legacy Fallback)
            // ═══════════════════════════════════════════════════════════
            switch (timeframe) {
                case '1m':
                    unit = 'minutes'; interval = '1';
                    fromDateObj = subDays(anchorDate, 1);
                    break;
                case '3m':
                     unit = 'minutes'; interval = '3';
                     fromDateObj = subDays(anchorDate, 7);
                     break;
                case '5m':
                    unit = 'minutes'; interval = '5';
                    fromDateObj = subDays(anchorDate, 5);
                    break;
                case '15m':
                    unit = 'minutes'; interval = '15';
                    fromDateObj = subDays(anchorDate, 5);
                    break;
                case '30m':
                    unit = 'minutes'; interval = '30';
                    fromDateObj = subMonths(anchorDate, 1);
                    break;
                case '1h':
                    unit = 'hours'; interval = '1';
                    fromDateObj = subMonths(anchorDate, 3);
                    break;
                case '1d':
                    unit = 'days'; interval = '1';
                    fromDateObj = subYears(anchorDate, 1);
                    break;
                case '1w':
                    unit = 'weeks'; interval = '1';
                    fromDateObj = subYears(anchorDate, 5);
                    break;
                case '1M':
                    unit = 'months'; interval = '1';
                    fromDateObj = subYears(anchorDate, 10);
                    break;
                default:
                    unit = 'minutes'; interval = '1';
                    fromDateObj = subDays(anchorDate, 1);
            }
        }

        return {
            unit,
            interval,
            fromDate: this.formatDateIST(fromDateObj),
            toDate: toDateStr
        };
    }

    /**
     * Format Date to YYYY-MM-DD in Asia/Kolkata timezone
     */
    private static formatDateIST(date: Date): string {
        // Use Intl to get correct date in IST regardless of server time
        const formatter = new Intl.DateTimeFormat('en-CA', { 
            timeZone: this.TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        return formatter.format(date);
    }
}
