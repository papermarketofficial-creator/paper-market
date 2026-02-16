// ═══════════════════════════════════════════════════════════
// 🎯 DOMAIN TYPES: Framework-agnostic market data types
// ═══════════════════════════════════════════════════════════

/**
 * Normalized tick format (broker-agnostic)
 */
export interface NormalizedTick {
    instrumentKey: string;   // Canonical instrument identity (e.g., "NSE_EQ|INE002A01018")
    symbol?: string;         // Display symbol only (e.g., "RELIANCE")
    price: number;           // Last traded price
    volume: number;          // Volume (if available)
    timestamp: number;       // Unix timestamp in SECONDS (not milliseconds)
    exchange: string;        // Exchange (e.g., "NSE", "BSE")
    close?: number;          // Previous close for change calculation
}

/**
 * Domain-level candle type (replaces lightweight-charts CandlestickData)
 * Chart libraries should never define backend types.
 */
export interface Candle {
    time: number;            // Unix timestamp in SECONDS
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

/**
 * Candle update event
 */
export interface CandleUpdate {
    type: 'new' | 'update';
    candle: Candle;
    instrumentKey: string;
    symbol?: string;
    interval: number;        // Interval in seconds (60, 300, 900, etc.)
}
