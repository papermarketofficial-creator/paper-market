
import { config } from "@/lib/config";
import { RequestRateLimiter } from "../common/rate-limiter";
import { MarketIntegrationError } from "../types";

export class TrueDataClient {
    private static instance: TrueDataClient;
    private rateLimiter: RequestRateLimiter;
    private accessToken: string | null = null;
    private tokenExpiry: number = 0;

    private constructor() {
        this.rateLimiter = new RequestRateLimiter();
    }

    public static getInstance(): TrueDataClient {
        if (!TrueDataClient.instance) {
            TrueDataClient.instance = new TrueDataClient();
        }
        return TrueDataClient.instance;
    }

    private async getValidToken(): Promise<string> {
        if (this.accessToken && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }
        return this.authenticate();
    }

    private async authenticate(): Promise<string> {
        if (!config.truedata.userId || !config.truedata.password) {
            throw new MarketIntegrationError(
                "TrueData credentials not configured",
                "CONFIG_MISSING",
                500,
                "TRUEDATA"
            );
        }

        // Mock auth call for TrueData
        // Real endpoint: POST /auth/login usually
        this.accessToken = "mock_truedata_token";
        this.tokenExpiry = Date.now() + (24 * 60 * 60 * 1000);

        return this.accessToken;
    }

    public async request<T>(method: string, endpoint: string, params: Record<string, any> = {}): Promise<T> {
        await this.rateLimiter.waitForPermit("TRUEDATA");

        const token = await this.getValidToken();
        const url = new URL(`${config.truedata.baseUrl}${endpoint}`);

        const init: RequestInit = {
            method,
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json",
            },
        };

        if (method === "GET") {
            Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
        } else {
            init.body = JSON.stringify(params);
            init.headers = { ...init.headers, "Content-Type": "application/json" };
        }

        try {
            const response = await fetch(url.toString(), init);

            if (!response.ok) {
                if (response.status === 401) {
                    // Retry once
                    this.accessToken = null;
                    const newToken = await this.authenticate();
                    init.headers = { ...init.headers, "Authorization": `Bearer ${newToken}` };
                    const retry = await fetch(url.toString(), init);
                    if (!retry.ok) throw new Error(`TrueData API Error: ${retry.statusText}`);
                    return await retry.json() as T;
                }
                throw new Error(`TrueData API Error: ${response.status} ${response.statusText}`);
            }

            return await response.json() as T;

        } catch (error: unknown) {
            throw new MarketIntegrationError(
                error instanceof Error ? error.message : "Network Request Failed",
                "NETWORK_ERROR",
                502,
                "TRUEDATA",
                error
            );
        }
    }
}
