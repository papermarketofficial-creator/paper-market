
import {
    IMarketDataSource,
    MarketQuote,
    MarketCandle,
    OptionChain,
    MarketIntegrationError
} from "../types";
import { TrueDataClient } from "./client";
import { normalizeTrueDataChain } from "../common/normalizer";

export class TrueDataProvider implements IMarketDataSource {
    private client: TrueDataClient;

    constructor() {
        this.client = TrueDataClient.getInstance();
    }

    async getQuote(symbol: string): Promise<MarketQuote> {
        // TrueData might have quote, but we primarily use Upstox for this.
        // Implementing for completeness if fallback needed.
        throw new MarketIntegrationError(
            "Use Upstox for standard Quotes.",
            "NOT_PREFERRED",
            400,
            "TRUEDATA"
        );
    }

    async getHistory(symbol: string, interval: string, from: Date, to: Date): Promise<MarketCandle[]> {
        throw new MarketIntegrationError(
            "Use Upstox for Historical Data.",
            "NOT_PREFERRED",
            400,
            "TRUEDATA"
        );
    }

    async getOptionChain(symbol: string, expiry: Date): Promise<OptionChain> {
        // TrueData Option Chain logic
        // Endpoint: /option-chain?symbol=...&expiry=...

        const response = await this.client.request<any[]>("GET", "/option-chain", {
            symbol,
            expiry: expiry.toISOString().split('T')[0]
        });

        if (!Array.isArray(response)) {
            throw new MarketIntegrationError(
                "Invalid response format from TrueData Option Chain",
                "INVALID_DATA",
                502,
                "TRUEDATA"
            );
        }

        return normalizeTrueDataChain(symbol, expiry, response);
    }
}
