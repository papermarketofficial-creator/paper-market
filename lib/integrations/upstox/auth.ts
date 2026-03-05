import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { MarketIntegrationError } from "../types";

interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number; // seconds
}

/**
 * Generate Upstox OAuth authorization URL.
 * User will be redirected to this URL to grant access.
 */
export function getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
        client_id: config.upstox.apiKey!,
        redirect_uri: config.upstox.redirectUri!,
        response_type: "code",
    });

    if (state) {
        params.append("state", state);
    }

    return `https://api.upstox.com/v2/login/authorization/dialog?${params.toString()}`;
}

/**
 * Exchange authorization code for access token.
 * Called after user completes OAuth flow.
 */
export async function exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    expiresAt: Date;
}> {
    const tokenUrl = "https://api.upstox.com/v2/login/authorization/token";

    const body = new URLSearchParams({
        code,
        client_id: config.upstox.apiKey!,
        client_secret: config.upstox.apiSecret!,
        redirect_uri: config.upstox.redirectUri!,
        grant_type: "authorization_code",
    });

    try {
        logger.info("Exchanging code for Upstox token");

        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
            body: body.toString(),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error({ status: response.status, error: errorText }, "Upstox token exchange failed");
            throw new MarketIntegrationError(
                `Token exchange failed: ${response.status}`,
                "TOKEN_EXCHANGE_FAILED",
                response.status,
                "UPSTOX"
            );
        }

        const data: TokenResponse = await response.json();

        // Calculate expiry time (Upstox tokens typically expire at end of day or after X seconds)
        const expiresAt = new Date(Date.now() + data.expires_in * 1000);

        logger.info({ expiresAt }, "Upstox token obtained successfully");

        return {
            accessToken: data.access_token,
            expiresAt,
        };
    } catch (error) {
        if (error instanceof MarketIntegrationError) {
            throw error;
        }
        logger.error({ err: error }, "Failed to exchange Upstox code");
        throw new MarketIntegrationError(
            "Network error during token exchange",
            "NETWORK_ERROR",
            502,
            "UPSTOX",
            error
        );
    }
}

/**
 * Check if credentials are configured.
 */
export function isConfigured(): boolean {
    return !!(config.upstox.apiKey && config.upstox.apiSecret && config.upstox.redirectUri);
}
