import { logger } from "./logger";

/**
 * Simple Token Bucket Rate Limiter
 * Ensures we don't exceed `requestsPerSecond`
 */
export class RateLimiter {
    private tokens: number;
    private lastRefill: number;
    private maxTokens: number;
    private refillRateMs: number;
    private queue: Array<(value: void) => void> = [];

    constructor(requestsPerSecond: number = 10) {
        this.maxTokens = requestsPerSecond;
        this.tokens = requestsPerSecond;
        this.lastRefill = Date.now();
        this.refillRateMs = 1000 / requestsPerSecond;
    }

    /**
     * Wait for a token to be available
     */
    async waitForToken(context: string = "api"): Promise<void> {
        this.refill();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return;
        }

        // No tokens, queue the request
        logger.debug({ context, queueLength: this.queue.length }, "Rate limit reached, queuing request");
        return new Promise<void>((resolve) => {
            this.queue.push(resolve);
            // Ensure we process the queue eventually
            if (this.queue.length === 1) {
               this.scheduleQueueProcessor();
            }
        });
    }

    private refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        
        // Refill tokens based on time passed
        // e.g. if rate is 10/s (1 every 100ms) and 200ms passed, add 2 tokens
        const newTokens = Math.floor(elapsed / this.refillRateMs);
        
        if (newTokens > 0) {
            this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
            this.lastRefill = now;
        }
    }

    private scheduleQueueProcessor() {
        const checkInterval = setInterval(() => {
            this.refill();
            
            while (this.tokens >= 1 && this.queue.length > 0) {
                this.tokens -= 1;
                const next = this.queue.shift();
                if (next) next();
            }

            if (this.queue.length === 0) {
                clearInterval(checkInterval);
            }
        }, this.refillRateMs); // Check at the rate of token generation
    }
}

// Global instance: 10 requests per second max
// Upstox limit is often higher (e.g. 20-50), but 10 is super safe.
export const upstoxRateLimiter = new RateLimiter(10);
