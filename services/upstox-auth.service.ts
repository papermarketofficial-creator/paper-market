import { db } from "@/lib/db";
import { upstoxTokens } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/errors";
import { eq } from "drizzle-orm";
import { getAuthorizationUrl, exchangeCodeForToken, isConfigured } from "@/lib/integrations/upstox/auth";

export class UpstoxAuthService {
    /**
     * Check if Upstox integration is properly configured.
     */
    static isConfigured(): boolean {
        return isConfigured();
    }

    /**
     * Generate the authorization URL for a user to connect their Upstox account.
     * @param userId - The user's ID (used as state for CSRF protection)
     */
    static getLoginUrl(userId: string): string {
        if (!this.isConfigured()) {
            throw new ApiError("Upstox integration not configured", 500, "UPSTOX_NOT_CONFIGURED");
        }
        return getAuthorizationUrl(userId);
    }

    /**
     * Handle OAuth callback - exchange code for token and store it.
     * @param userId - The authenticated user's ID
     * @param code - The authorization code from Upstox
     */
    static async handleCallback(userId: string, code: string): Promise<void> {
        try {
            logger.info({ userId }, "Handling Upstox OAuth callback");

            // Exchange code for token
            const { accessToken, expiresAt } = await exchangeCodeForToken(code);

            // Upsert token in database
            await db
                .insert(upstoxTokens)
                .values({
                    userId,
                    accessToken,
                    expiresAt,
                })
                .onConflictDoUpdate({
                    target: upstoxTokens.userId,
                    set: {
                        accessToken,
                        expiresAt,
                        updatedAt: new Date(),
                    },
                });

            logger.info({ userId, expiresAt }, "Upstox token stored successfully");
        } catch (error) {
            logger.error({ err: error, userId }, "Failed to handle Upstox callback");
            throw error;
        }
    }

    /**
     * Get valid access token for a user.
     * Returns null if no token exists or token is expired.
     */
    static async getValidToken(userId: string): Promise<string | null> {
        try {
            const [token] = await db
                .select()
                .from(upstoxTokens)
                .where(eq(upstoxTokens.userId, userId))
                .limit(1);

            if (!token) {
                return null;
            }

            // Check if token is expired
            if (new Date() >= token.expiresAt) {
                logger.warn({ userId }, "Upstox token expired");
                return null;
            }

            return token.accessToken;
        } catch (error) {
            logger.error({ err: error, userId }, "Failed to get Upstox token");
            return null;
        }
    }

    /**
     * Get connection status for a user.
     */
    static async getStatus(userId: string): Promise<{
        connected: boolean;
        expiresAt: Date | null;
    }> {
        try {
            const [token] = await db
                .select({ expiresAt: upstoxTokens.expiresAt })
                .from(upstoxTokens)
                .where(eq(upstoxTokens.userId, userId))
                .limit(1);

            if (!token) {
                return { connected: false, expiresAt: null };
            }

            const isExpired = new Date() >= token.expiresAt;
            return {
                connected: !isExpired,
                expiresAt: token.expiresAt,
            };
        } catch (error) {
            logger.error({ err: error, userId }, "Failed to get Upstox status");
            return { connected: false, expiresAt: null };
        }
    }

    /**
     * Disconnect Upstox - remove stored token.
     */
    static async disconnect(userId: string): Promise<void> {
        try {
            await db
                .delete(upstoxTokens)
                .where(eq(upstoxTokens.userId, userId));

            logger.info({ userId }, "Upstox disconnected");
        } catch (error) {
            logger.error({ err: error, userId }, "Failed to disconnect Upstox");
            throw error;
        }
    }
}
