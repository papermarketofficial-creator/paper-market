
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
import { toUnixSeconds } from "./time";

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
    private static readonly MARKET_OPEN_MINUTES = 9 * 60 + 15;

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
        let rawCandles = await UpstoxService.getHistoricalCandleData(
            params.instrumentKey,
            unit,
            interval,
            fromDate,
            toDate
        );

        if (this.shouldBackfillLatestSession(params, unit, interval, rawCandles)) {
            console.log(
                `Candle backfill: empty 1D session for ${params.instrumentKey} on ${toDate}, searching previous sessions`
            );
            rawCandles = await this.fetchLatestAvailableSessionCandles(
                params.instrumentKey,
                unit,
                interval,
                toDate
            );
        }

        // ═══════════════════════════════════════════════════════════
        // 🎨 FORMAT: Domain -> Presentation
        // ═══════════════════════════════════════════════════════════
        // Upstox: [timestamp(ISO+Offset), open, high, low, close, volume, oi]
        // LWC: { time: unix_seconds, ... }
        
        // Debug first/last if needed (Env controlled)
        if (process.env.DEBUG_MARKET === 'true' && rawCandles.length > 0) {
            console.log(`🎻 Orchestrator: First ${rawCandles[0][0]}, Last ${rawCandles[rawCandles.length-1][0]}`);
        }

       const formattedCandles: FormattedCandle[] = [];
const formattedVolume: FormattedVolume[] = [];

for (const c of rawCandles) {
    const time = toUnixSeconds(c[0]);

    formattedCandles.push({
        time,
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
    });

    formattedVolume.push({
        time,
        value: c[5],
        color: c[4] >= c[1] ? '#22C55E' : '#EF4444'
    });
}


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
                        // 1D initial load must show a single trading session:
                        // - if current session is live/completed today -> use today
                        // - otherwise -> use latest completed trading day (e.g. Friday on weekends)
                        if (this.isWithinOrAfterSessionIST(anchorDate)) {
                            fromDateObj = anchorDate;
                            toDateStr = this.formatDateIST(anchorDate);
                        } else {
                            const latestCompletedTradingDay = this.getLatestCompletedTradingDayIST(anchorDate);
                            fromDateObj = latestCompletedTradingDay;
                            toDateStr = this.formatDateIST(latestCompletedTradingDay);
                        }
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

    private static shouldBackfillLatestSession(
        params: CandleFetchParams,
        unit: string,
        interval: string,
        rawCandles: unknown[]
    ): boolean {
        if (rawCandles.length > 0) return false;
        if (params.toDate) return false; // pagination path should not auto-shift cursor
        if ((params.range || '').toUpperCase() !== '1D') return false;
        return unit === 'minutes' && interval === '1';
    }

    private static async fetchLatestAvailableSessionCandles(
        instrumentKey: string,
        unit: string,
        interval: string,
        anchorToDate: string
    ): Promise<any[]> {
        let cursor = new Date(anchorToDate);

        // Backfill at most the previous 7 calendar days to cover weekends/holidays.
        for (let i = 0; i < 7; i += 1) {
            cursor = subDays(cursor, 1);
            if (this.isWeekendIST(cursor)) continue;

            const day = this.formatDateIST(cursor);
            const candles = await UpstoxService.getHistoricalCandleData(
                instrumentKey,
                unit,
                interval,
                day,
                day
            );

            if (candles.length > 0) {
                return candles;
            }

            const windowFrom = this.formatDateIST(subDays(cursor, 2));
            const windowCandles = await UpstoxService.getHistoricalCandleData(
                instrumentKey,
                unit,
                interval,
                windowFrom,
                day
            );
            const latestSession = this.extractLatestSession(windowCandles);
            if (latestSession.length > 0) {
                return latestSession;
            }
        }

        return [];
    }

    private static extractLatestSession(candles: any[]): any[] {
        if (candles.length === 0) return [];

        let latestSessionDate = '';
        for (const candle of candles) {
            const timestamp = String(candle?.[0] ?? '');
            const sessionDate = timestamp.slice(0, 10);
            if (sessionDate > latestSessionDate) {
                latestSessionDate = sessionDate;
            }
        }

        if (!latestSessionDate) return [];
        return candles.filter((candle) => String(candle?.[0] ?? '').startsWith(latestSessionDate));
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

    /**
     * True when current IST time is in-session or post-session for a weekday.
     */
    private static isWithinOrAfterSessionIST(now: Date): boolean {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: this.TIMEZONE,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(now);

        const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
        if (weekday === 'Sat' || weekday === 'Sun') return false;

        const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
        const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0');
        const totalMinutes = hour * 60 + minute;

        return totalMinutes >= this.MARKET_OPEN_MINUTES && totalMinutes <= (24 * 60);
    }

    private static isWeekendIST(date: Date): boolean {
        const weekday = new Intl.DateTimeFormat('en-GB', {
            timeZone: this.TIMEZONE,
            weekday: 'short',
        }).format(date);
        return weekday === 'Sat' || weekday === 'Sun';
    }

    /**
     * Latest completed trading day in IST (weekday).
     * If now is a weekday pre-open, returns previous weekday.
     */
    private static getLatestCompletedTradingDayIST(now: Date): Date {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: this.TIMEZONE,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(now);

        const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
        const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
        const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0');
        const totalMinutes = hour * 60 + minute;

        let cursor = new Date(now);

        // Weekend or pre-open weekday -> step back one day first.
        if (weekday === 'Sat' || weekday === 'Sun' || totalMinutes < this.MARKET_OPEN_MINUTES) {
            cursor = subDays(cursor, 1);
        }

        while (this.isWeekendIST(cursor)) {
            cursor = subDays(cursor, 1);
        }

        return cursor;
    }
}
