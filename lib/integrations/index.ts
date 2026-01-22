
import {
    IMarketDataSource,
    MarketQuote,
    MarketCandle,
    OptionChain,
    MarketIntegrationError
} from "./types";
import { UpstoxProvider } from "./upstox/provider";
import { TrueDataProvider } from "./truedata/provider";

/**
 * MarketGateway
 * The Singleton Facade for all Market Data operations.
 * Routes traffic to specific providers based on data type.
 */
class MarketGatewayImpl implements IMarketDataSource {
    private static instance: MarketGatewayImpl;
    private upstox: UpstoxProvider;
    private truedata: TrueDataProvider;

    private constructor() {
        this.upstox = new UpstoxProvider();
        this.truedata = new TrueDataProvider();
    }

    public static getInstance(): MarketGatewayImpl {
        if (!MarketGatewayImpl.instance) {
            MarketGatewayImpl.instance = new MarketGatewayImpl();
        }
        return MarketGatewayImpl.instance;
    }

    /**
     * Get Real-time Quote
     * Source: Upstox
     */
    public async getQuote(symbol: string): Promise<MarketQuote> {
        try {
            return await this.upstox.getQuote(symbol);
        } catch (error) {
            this.handleError(error);
        }
        throw new Error("Unreachable");
    }

    /**
     * Get Historical Candles
     * Source: Upstox
     */
    public async getHistory(symbol: string, interval: string, from: Date, to: Date): Promise<MarketCandle[]> {
        try {
            return await this.upstox.getHistory(symbol, interval, from, to);
        } catch (error) {
            this.handleError(error);
        }
        throw new Error("Unreachable");
    }

    /**
     * Get Option Chain with Greeks
     * Source: TrueData
     */
    public async getOptionChain(symbol: string, expiry: Date): Promise<OptionChain> {
        try {
            return await this.truedata.getOptionChain(symbol, expiry);
        } catch (error) {
            this.handleError(error);
        }
        throw new Error("Unreachable");
    }

    private handleError(error: unknown) {
        if (error instanceof MarketIntegrationError) {
            throw error;
        }
        // Wrap unknown errors
        throw new MarketIntegrationError(
            error instanceof Error ? error.message : "Unknown Market Gateway Error",
            "GATEWAY_ERROR",
            500,
            "GATEWAY",
            error
        );
    }
}

export const MarketGateway = MarketGatewayImpl.getInstance();
export * from "./types";
