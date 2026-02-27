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
    private rejectedTokens = new Map<string, number>();
    private readonly REJECT_COOLDOWN_MS = 5 * 60 * 1000;

    private normalizeToken(token: string): string {
        return String(token || '').replace(/^Bearer\s+/i, '').trim();
    }

    private cleanupRejectedTokens(nowMs: number): void {
        for (const [token, retryAt] of this.rejectedTokens.entries()) {
            if (retryAt <= nowMs) {
                this.rejectedTokens.delete(token);
            }
        }
    }

    /**
     * Get a valid Upstox access token
     */
    async getToken(): Promise<string> {
        const nowMs = Date.now();
        this.cleanupRejectedTokens(nowMs);

        // Check cache first
        if (
            this.cachedToken &&
            nowMs < this.cacheExpiry &&
            !this.rejectedTokens.has(this.cachedToken)
        ) {
            return this.cachedToken;
        }

        // Priority 1: Database lookup
        try {
            const tokens = await db
                .select()
                .from(upstoxTokens)
                .where((t) => sql`${t.expiresAt} > NOW()`)
                .orderBy(desc(upstoxTokens.updatedAt))
                .limit(10);

            for (const candidate of tokens) {
                const normalized = this.normalizeToken(candidate.accessToken);
                if (!normalized) continue;
                if (this.rejectedTokens.has(normalized)) continue;

                logger.info('Using Upstox token from database');
                this.cachedToken = normalized;
                // Cache until token expiry
                this.cacheExpiry = new Date(candidate.expiresAt).getTime();
                return normalized;
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
    invalidate(token?: string) {
        logger.warn('Invalidating cached Upstox token');

        const normalized = token ? this.normalizeToken(token) : null;
        if (normalized) {
            this.rejectedTokens.set(normalized, Date.now() + this.REJECT_COOLDOWN_MS);
        }

        this.cachedToken = null;
        this.cacheExpiry = 0;
    }
}

export const tokenProvider = new TokenProvider();
