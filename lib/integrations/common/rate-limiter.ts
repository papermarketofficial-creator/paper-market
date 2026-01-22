
import { MarketIntegrationError } from "../types";

export class RequestRateLimiter {
    private tokens: Map<string, number> = new Map();
    private lastRefill: Map<string, number> = new Map();

    // Default config: 10 requests per second per provider
    private readonly capacity = 10;
    private readonly refillRate = 10; // tokens per second

    constructor() { }

    async waitForPermit(providerId: string): Promise<void> {
        this.refill(providerId);

        const currentTokens = this.tokens.get(providerId) ?? this.capacity;

        if (currentTokens >= 1) {
            this.tokens.set(providerId, currentTokens - 1);
            return;
        }

        // Calculate wait time
        // If we have 0 tokens, we need to wait for 1 token.
        // 1 token takes (1000ms / refillRate) to accumulate.
        const msToWait = 1000 / this.refillRate;

        await new Promise(resolve => setTimeout(resolve, msToWait));

        // Recursive retry after waiting
        return this.waitForPermit(providerId);
    }

    private refill(providerId: string) {
        const now = Date.now();
        const last = this.lastRefill.get(providerId) ?? now;
        const elapsed = (now - last) / 1000; // seconds

        if (elapsed > 0) {
            const addedTokens = elapsed * this.refillRate;
            const currentTokens = this.tokens.get(providerId) ?? this.capacity;
            const newTokens = Math.min(this.capacity, currentTokens + addedTokens);

            this.tokens.set(providerId, newTokens);
            this.lastRefill.set(providerId, now);
        }
    }
}
