import { db } from '../lib/db.js';
import { upstoxTokens } from '../lib/schema.js';
import { desc, sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

// ═══════════════════════════════════════════════════════════
// 🔐 TOKEN PROVIDER: Standalone token management
// ═══════════════════════════════════════════════════════════
/**
 * TokenProvider manages Upstox access tokens without Next.js dependencies.
 * 
 * Priority:
 * 1. Database lookup (freshest valid token from any user)
 * 
 * This replaces UpstoxService.getSystemToken() for the market-engine.
 */
class TokenProvider {
    private cachedToken: string | null = null;
    private cacheExpiry: number = 0;

    /**
     * Get a valid Upstox access token
     */
    async getToken(): Promise<string> {
        // Check cache first
        if (this.cachedToken && Date.now() < this.cacheExpiry) {
            return this.cachedToken;
        }

        // Priority 1: Database lookup
        try {
            const tokens = await db
                .select()
                .from(upstoxTokens)
                .where((t) => sql`${t.expiresAt} > NOW()`)
                .orderBy(desc(upstoxTokens.expiresAt))
                .limit(1);

            if (tokens.length > 0) {
                logger.info('Using Upstox token from database');
                this.cachedToken = tokens[0].accessToken;
                // Cache until token expiry
                this.cacheExpiry = new Date(tokens[0].expiresAt).getTime();
                return tokens[0].accessToken;
            }
        } catch (error) {
            logger.error({ err: error }, 'Failed to fetch token from database');
        }

        throw new Error(
            'No valid Upstox access token found in database.'
        );
    }

    /**
     * Invalidate cached token (called on auth errors)
     */
    invalidate() {
        logger.warn('Invalidating cached Upstox token');
        this.cachedToken = null;
        this.cacheExpiry = 0;
    }
}

export const tokenProvider = new TokenProvider();
