
import {
    IMarketDataSource,
    MarketQuote,
    MarketCandle,
    OptionChain,
    MarketIntegrationError
} from "../types";
import { UpstoxClient } from "./client";
import { normalizeUpstoxQuote, normalizeUpstoxCandle } from "../common/normalizer";

export class UpstoxProvider implements IMarketDataSource {
    private client: UpstoxClient;

    constructor() {
        this.client = UpstoxClient.getInstance();
    }

    async getQuote(symbol: string): Promise<MarketQuote> {
        // Endpoint: /market-quote/ltp?symbol=...
        // Providing full quote endpoint if available
        const response = await this.client.request<any>("GET", "/market-quote/quotes", {
            symbol: symbol,
        });

        // Upstox retuns map: { "NSE_EQ|RELIANCE": { ... } }
        // We assume 'symbol' passed here is formatted correctly for Upstox (e.g. NSE_EQ|RELIANCE)
        // or we need a symbol mapper. For Phase 3, we assume raw symbol.
        const quoteData = response[symbol];

        if (!quoteData) {
            throw new MarketIntegrationError(
                `Quote not found for symbol: ${symbol}`,
                "DATA_NOT_FOUND",
                404,
                "UPSTOX"
            );
        }

        return normalizeUpstoxQuote(symbol, quoteData);
    }

    async getHistory(symbol: string, interval: string, from: Date, to: Date): Promise<MarketCandle[]> {
        // Endpoint: /historical-candle/:instrumentKey/:interval/:to_date/:from_date
        // Upstox interval mapping needs to be handled.

        const fromStr = from.toISOString().split('T')[0];
        const toStr = to.toISOString().split('T')[0];

        // Mocking the URL structure construction which is path param based in Upstox
        const endpoint = `/historical-candle/${encodeURIComponent(symbol)}/${interval}/${toStr}/${fromStr}`;

        const response = await this.client.request<any>("GET", endpoint);

        // response.candles is array of arrays
        if (!Array.isArray(response?.candles)) {
            return [];
        }

        return response.candles.map((c: any[]) => normalizeUpstoxCandle(symbol, c, interval));
    }

    async getOptionChain(symbol: string, expiry: Date): Promise<OptionChain> {
        // Upstox returns option chain via /option/chain (hypothetical or specific endpoint)
        // If Upstox doesn't support full chain in one go, needed internal logic.
        // Returning empty or throwing "Not Implemented" if Upstox is not the source for Options (TrueData is).

        // Per requirement: "TrueData: For Options Chain & Greeks"
        // So Upstox provider might not implement this or return partial.

        throw new MarketIntegrationError(
            "Upstox Provider does not support Option Chain with Greeks. Use TrueData.",
            "NOT_SUPPORTED",
            501,
            "UPSTOX"
        );
    }
}
