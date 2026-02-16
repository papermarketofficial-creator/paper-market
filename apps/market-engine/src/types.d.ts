declare module "*.json" {
    const value: any;
    export default value;
}

declare module "upstox-js-sdk" {
    export class ApiClient {
        static instance: ApiClient;
        authentications: {
            OAUTH2: {
                accessToken: string;
            };
        };
    }

    export class MarketDataStreamerV3 {
        constructor(instrumentKeys: string[], mode: string);
        on(event: string, handler: (...args: any[]) => void): void;
        connect(): void;
        disconnect(): void;
        subscribe(instrumentKeys: string[], mode: string): void;
        unsubscribe(instrumentKeys: string[]): void;
        autoReconnect(enabled: boolean): void;
    }
}
