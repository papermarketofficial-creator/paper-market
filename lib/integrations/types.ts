
export interface MarketQuote {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    timestamp: Date;
    dayHigh: number;
    dayLow: number;
    previousClose: number;
    open: number;
}

export interface MarketCandle {
    symbol: string;
    interval: string;
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface GreekData {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    iv: number;
}

export interface OptionChainItem {
    strikePrice: number;
    call: GreekData & MarketQuote;
    put: GreekData & MarketQuote;
}

export interface OptionChain {
    symbol: string;
    expiry: Date;
    strikes: OptionChainItem[];
}

export interface IMarketDataSource {
    getQuote(symbol: string): Promise<MarketQuote>;
    getHistory(symbol: string, interval: string, from: Date, to: Date): Promise<MarketCandle[]>;
    getOptionChain(symbol: string, expiry: Date): Promise<OptionChain>;
}

export class MarketIntegrationError extends Error {
    constructor(
        public message: string,
        public code: string,
        public statusCode: number,
        public provider: string,
        public originalError?: unknown
    ) {
        super(message);
        this.name = "MarketIntegrationError";
    }
}
