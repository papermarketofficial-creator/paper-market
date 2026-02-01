import { NextRequest, NextResponse } from "next/server";
import { UpstoxService } from "@/services/upstox.service";
import { auth } from "@/lib/auth"; // Correct V5 import

import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Helper to resolve instrument key from DB
async function getInstrumentKey(symbol: string): Promise<string> {
    // 1. Try DB Lookup
    try {
        const [instrument] = await db
            .select({ token: instruments.instrumentToken })
            .from(instruments)
            .where(eq(instruments.tradingsymbol, symbol))
            .limit(1);
        
        if (instrument) return instrument.token;
    } catch (e) {
        console.error("DB Lookup Failed", e);
    }
    
    // 2. Fallback
    return `NSE_EQ|${symbol}`;
}

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const symbol = searchParams.get("symbol");
        const instrumentKeyParam = searchParams.get("instrumentKey"); // Direct key support
        const timeframe = searchParams.get("timeframe");
        const range = searchParams.get("range"); // New param: 1d, 5d, 1mo, 6mo, 1y, 3y, 5y
        const toDateParam = searchParams.get("toDate"); // Pagination Support

        if (!symbol && !instrumentKeyParam) {
             return NextResponse.json({ success: false, error: "Symbol or Instrument Key required" }, { status: 400 });
        }

        // 1. Resolve ISIN
        let instrumentKey = instrumentKeyParam;
        if (!instrumentKey && symbol) {
            instrumentKey = await getInstrumentKey(symbol.toUpperCase());
        }

        if (!instrumentKey) throw new Error("Instrument Key undefined"); // Should not happen

        // 2. Resolve Interval & Dates based on Range OR Timeframe
        const mapTimeframeToUpstox = (tf: string) => {
          switch(tf) {
            case '1m': return { unit: 'minutes', interval: '1' };
            case '3m': return { unit: 'minutes', interval: '3' };
            case '5m': return { unit: 'minutes', interval: '5' };
            case '15m': return { unit: 'minutes', interval: '15' };
            case '30m': return { unit: 'minutes', interval: '30' };
            case '1h': return { unit: 'hours', interval: '1' }; 
            case '1d': return { unit: 'days', interval: '1' };
            case '1w': return { unit: 'weeks', interval: '1' };
            case '1M': return { unit: 'months', interval: '1' };
            default: return { unit: 'minutes', interval: '1' };
          }
        };
        let unit = 'minutes';
        let interval = '1';
        let fromDateStr = '';
        
        // Date logic
        // If toDate is provided, use it. Else Today.
        const toDateObj = toDateParam ? new Date(toDateParam) : new Date();
        
        // Fix: Upstox API toDate is effectively exclusive for intraday if passing just YYYY-MM-DD
        // or inclusive up to 00:00. To get today's full data, we should pass tomorrow's date
        // or effectively the end of today. 
        // Simplest fix: Add 1 day if we want "up to now" or just use current date + 1
        // We clone toDateObj to safeDate and add 1 day
        const safeDate = new Date(toDateObj);
        safeDate.setDate(safeDate.getDate() + 1);
        
        const toDateStr = safeDate.toISOString().split('T')[0];

        if (range) {
            // Range-based Logic (Overrides timeframe)
            // Calculate Start Date relative to End Date
            const fromDateObj = new Date(toDateObj);
            
            switch (range.toLowerCase()) {
                case '1d': // 1 Day View, but fetch 7 days for scrolling
                    unit = 'minutes';
                    interval = '1';
                    fromDateObj.setDate(toDateObj.getDate() - 7); 
                    break;
                case '5d': 
                    unit = 'minutes';
                    interval = '30';
                    fromDateObj.setDate(toDateObj.getDate() - 14);
                    break;
                case '1mo': // 1 Month
                    unit = 'minutes';
                    interval = '60'; // 1 Hour
                    fromDateObj.setMonth(toDateObj.getMonth() - 1);
                    break;
                case '6mo':
                    unit = 'days';
                    interval = '1';
                    fromDateObj.setMonth(toDateObj.getMonth() - 6);
                    break;
                case '1y':
                    unit = 'days';
                    interval = '1';
                    fromDateObj.setFullYear(toDateObj.getFullYear() - 1);
                    break;
                case '3y':
                    unit = 'weeks';
                    interval = '1';
                    fromDateObj.setFullYear(toDateObj.getFullYear() - 3);
                    break;
                case '5y':
                    unit = 'weeks';
                    interval = '1';
                    fromDateObj.setFullYear(toDateObj.getFullYear() - 5);
                    break;
                default: // Default 1y
                    unit = 'days';
                    interval = '1';
                    fromDateObj.setFullYear(toDateObj.getFullYear() - 1);
            }
            fromDateStr = fromDateObj.toISOString().split('T')[0];
        
        } else {
            // Fallback to legacy Timeframe logic
            const tfMap = mapTimeframeToUpstox(timeframe || '1m');
            unit = tfMap.unit;
            interval = tfMap.interval;
            
            const fromDateObj = new Date(toDateObj);
            if (unit === 'minutes') fromDateObj.setDate(toDateObj.getDate() - 7); // Default 7d for intraday
            else if (unit === 'hours') fromDateObj.setDate(toDateObj.getDate() - 90);
            else fromDateObj.setFullYear(toDateObj.getFullYear() - 1);
            
            fromDateStr = fromDateObj.toISOString().split('T')[0];
        }

        // 3. Fetch from Upstox
        // Strategy: For intraday timeframes (minutes/hours), we need TODAY's data from intraday API
        // and historical data from the regular API
        let candles: any[] = [];
        
        const today = new Date().toISOString().split('T')[0];
        const isIntradayTimeframe = unit === 'minutes' || unit === 'hours';
        
        if (isIntradayTimeframe) {
            // Fetch historical data (past days)
            const historicalCandles = await UpstoxService.getHistoricalCandleData(
                instrumentKey,
                unit,
                interval,
                fromDateStr,
                toDateStr
            );
            
            // Fetch today's intraday data
            const intradayCandles = await UpstoxService.getIntraDayCandleData(
                instrumentKey,
                unit,
                interval
            );
            
            // Combine: historical + today's intraday
            // Note: Historical API might not include today, so we append intraday
            candles = [...historicalCandles, ...intradayCandles];
            
            // Remove duplicates based on timestamp (in case there's overlap)
            const seen = new Set();
            candles = candles.filter((c: any[]) => {
                const timestamp = c[0];
                if (seen.has(timestamp)) return false;
                seen.add(timestamp);
                return true;
            });
            
            // Sort by timestamp (oldest first)
            candles.sort((a: any[], b: any[]) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
        } else {
            // For daily/weekly/monthly, use historical API only
            candles = await UpstoxService.getHistoricalCandleData(
                instrumentKey,
                unit,
                interval,
                fromDateStr,
                toDateStr
            );
        }

        // 5. Format for Lightweight Charts
        // Upstox Response: [timestamp, open, high, low, close, volume, oi]
        // Timestamp is ISO string (V3) with IST offset: "2026-02-01T12:30:00+05:30"
        // LWC expects: { time: number (Unix timestamp in seconds), open, high, low, close }
        
        // Debug: Log first and last candle timestamps
        if (candles.length > 0) {
            console.log('📅 First candle timestamp:', candles[0][0]);
            console.log('📅 Last candle timestamp:', candles[candles.length - 1][0]);
            const firstUnix = new Date(candles[0][0]).getTime() / 1000;
            const lastUnix = new Date(candles[candles.length - 1][0]).getTime() / 1000;
            console.log('📅 First Unix:', firstUnix, new Date(firstUnix * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
            console.log('📅 Last Unix:', lastUnix, new Date(lastUnix * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
        }

        const formattedCandles = candles.map((c: any[]) => ({
            time: new Date(c[0]).getTime() / 1000, // Unix Timestamp in seconds
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            // volume: c[5] // Volume passed separately? Or handled by frontend? 
            // Market store expects 'candles' and 'volume'.
        }));

        const formattedVolume = candles.map((c: any[]) => ({
            time: new Date(c[0]).getTime() / 1000,
            value: c[5],
            color: c[4] >= c[1] ? '#22C55E' : '#EF4444' // Green/Red
        }));

        return NextResponse.json({ 
            success: true, 
            data: {
                candles: formattedCandles,
                volume: formattedVolume
            } 
        });

    } catch (error: any) {
        console.error("Historical API Error:", error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
