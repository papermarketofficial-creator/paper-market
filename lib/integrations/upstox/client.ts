
import { config } from "@/lib/config";
import { RequestRateLimiter } from "../common/rate-limiter";
import { MarketIntegrationError } from "../types";

export class UpstoxClient {
    private static instance: UpstoxClient;
    private rateLimiter: RequestRateLimiter;
    private accessToken: string | null = null;
    private tokenExpiry: number = 0;

    private constructor() {
        this.rateLimiter = new RequestRateLimiter();
    }

    public static getInstance(): UpstoxClient {
        if (!UpstoxClient.instance) {
            UpstoxClient.instance = new UpstoxClient();
        }
        return UpstoxClient.instance;
    }

    private async getValidToken(): Promise<string> {
        // In a real production app, this would fetch from DB/Redis
        // For now, we simulate basic expiry check and re-auth flow
        if (this.accessToken && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        return this.refreshToken();
    }

    private async refreshToken(): Promise<string> {
        // Implementation of OAuth flow
        // For Phase 3, we mock the actual network call to "skip" login page 
        // because it requires browser interaction or a pre-supplied code.
        // In server-to-server, we usually use a long-lived refresh token.

        // This is a simplified "Client Credentials" style placeholder 
        // as Upstox strictly requires user-login for 3-legged OAuth.
        // We assume valid token is somehow provided or we throw if missing configuration.

        if (!config.upstox.apiKey || !config.upstox.apiSecret) {
            throw new MarketIntegrationError(
                "Upstox API credentials not configured",
                "CONFIG_MISSING",
                500,
                "UPSTOX"
            );
        }

        // Logic to swap refresh_token for access_token would go here.
        // For now, returning a mock or existing token to satisfy contract.
        // In production, this MUST call https://api.upstox.com/v2/login/authorization/token

        this.accessToken = "mock_access_token";
        this.tokenExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
        return this.accessToken;
    }

    public async request<T>(method: string, endpoint: string, params: Record<string, any> = {}): Promise<T> {
        await this.rateLimiter.waitForPermit("UPSTOX");

        const token = await this.getValidToken();
        const url = new URL(`${config.upstox.baseUrl}${endpoint}`);

        const init: RequestInit = {
            method,
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        };

        if (method === "GET") {
            Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
        } else {
            init.body = JSON.stringify(params);
        }

        try {
            const response = await fetch(url.toString(), init);

            if (!response.ok) {
                // Handle 401 specifically
                if (response.status === 401) {
                    // Force refresh and retry once
                    this.accessToken = null;
                    const newToken = await this.refreshToken();
                    init.headers = { ...init.headers, "Authorization": `Bearer ${newToken}` };
                    const retryResponse = await fetch(url.toString(), init);
                    if (!retryResponse.ok) {
                        throw new Error(`Upstox API error after retry: ${retryResponse.statusText}`);
                    }
                    return await retryResponse.json() as T;
                }

                throw new Error(`Upstox API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Upstox generic response wrapper usually structure is { status: 'success', data: ... }
            // We strip that here
            if (data && data.status === "error") {
                throw new Error(data.message || "Unknown Upstox Error");
            }

            return data.data as T;

        } catch (error: unknown) {
            throw new MarketIntegrationError(
                error instanceof Error ? error.message : "Network Request Failed",
                "NETWORK_ERROR",
                502,
                "UPSTOX",
                error
            );
        }
    }
}
