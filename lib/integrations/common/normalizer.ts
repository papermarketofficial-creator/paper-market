
import { MarketQuote, MarketCandle, OptionChain, OptionChainItem } from "../types";

export function normalizeUpstoxQuote(symbol: string, data: any): MarketQuote {
    // Upstox typical response: { o, h, l, c, lp, v, ... } or user provided structure
    // Assuming data is correct Upstox quote shape.
    // Safety check with safe defaults.
    return {
        symbol: symbol,
        price: Number(data.last_price || data.close || 0),
        change: Number(data.net_change || 0),
        changePercent: Number(data.change_percent || 0), // Upstox might not provide this directly in all endpoints
        volume: Number(data.volume || 0),
        timestamp: new Date(Number(data.last_trade_time || data.timestamp || Date.now())),
        dayHigh: Number(data.high || 0),
        dayLow: Number(data.low || 0),
        previousClose: Number(data.previous_close || data.ohlc?.close || 0),
        open: Number(data.open || 0),
    };
}

export function normalizeUpstoxCandle(symbol: string, candle: any[], interval: string): MarketCandle {
    // Upstox candle format array: [timestamp, open, high, low, close, volume, oi]
    return {
        symbol: symbol,
        interval: interval,
        timestamp: new Date(candle[0]),
        open: Number(candle[1]),
        high: Number(candle[2]),
        low: Number(candle[3]),
        close: Number(candle[4]),
        volume: Number(candle[5]),
    };
}

export function normalizeTrueDataChain(symbol: string, expiry: Date, data: any[]): OptionChain {
    // Transforming TrueData flat list into OptionChain items
    const strikesMap = new Map<number, Partial<OptionChainItem>>();

    for (const item of data) {
        // TrueData item logic (mocking realistic keys)
        // item = { symbol: "OS...CE", strike: 19000, type: "CE", ...greeks }
        const strike = Number(item.strike);
        const type = item.type; // "CE" or "PE"

        if (!strikesMap.has(strike)) {
            strikesMap.set(strike, { strikePrice: strike });
        }

        const entry = strikesMap.get(strike)!;
        const normalizedItem = {
            delta: Number(item.greeks?.delta || 0),
            gamma: Number(item.greeks?.gamma || 0),
            theta: Number(item.greeks?.theta || 0),
            vega: Number(item.greeks?.vega || 0),
            iv: Number(item.iv || 0),
            // Quote part
            symbol: item.symbol,
            price: Number(item.ltp || 0),
            change: Number(item.change || 0),
            changePercent: 0,
            volume: Number(item.volume || 0),
            timestamp: new Date(),
            dayHigh: 0,
            dayLow: 0,
            previousClose: 0,
            open: 0,
        };

        if (type === "CE") {
            entry.call = normalizedItem;
        } else {
            entry.put = normalizedItem;
        }
    }

    const strikes: OptionChainItem[] = [];
    strikesMap.forEach((val) => {
        if (val.call && val.put && val.strikePrice) {
            strikes.push(val as OptionChainItem);
        }
    });

    return {
        symbol,
        expiry,
        strikes: strikes.sort((a, b) => a.strikePrice - b.strikePrice)
    };
}
