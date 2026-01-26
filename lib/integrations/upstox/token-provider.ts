/**
 * Upstox Token Provider
 * 
 * Abstracts token retrieval for development and production environments.
 * - Dev: Reads from process.env.UPSTOX_ACCESS_TOKEN
 * - Prod: Will integrate with UpstoxAuthService (DB-backed) in future
 */

import { config } from "@/lib/config";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export class UpstoxTokenProvider {
    /**
     * Get a valid Upstox access token.
     * 
     * @throws ApiError if token is not configured
     * @returns The access token string
     */
    async getToken(): Promise<string> {
        const token = config.upstox.accessToken;

        if (!token) {
            logger.error("Upstox access token not configured");
            throw new ApiError(
                "Upstox access token not configured. Run: npx tsx scripts/generate-upstox-token.ts <CODE>",
                500,
                "UPSTOX_TOKEN_MISSING"
            );
        }

        // Log token retrieval (token is auto-redacted by logger)
        logger.debug("Upstox token retrieved from environment");

        return token;
    }

    /**
     * Check if a token is available (without throwing)
     */
    hasToken(): boolean {
        return !!config.upstox.accessToken;
    }
}

// Singleton instance for convenience
export const upstoxTokenProvider = new UpstoxTokenProvider();
