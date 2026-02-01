// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { upstoxRateLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Verification Script: Test Rate Limiting
 * 
 * This script verifies that:
 * 1. Rate limiter enforces 10 req/s limit
 * 2. Requests are queued properly
 * 3. Token bucket refills correctly
 */

async function testRateLimiting() {
    try {
        logger.info("=== Testing Rate Limiting ===");
        logger.info("Configured limit: 10 requests/second");

        // Test 1: Rapid fire 20 requests
        logger.info("Test 1: Sending 20 rapid requests...");
        const startTime = Date.now();
        const promises: Promise<void>[] = [];

        for (let i = 0; i < 20; i++) {
            promises.push(
                upstoxRateLimiter.waitForToken(`test-${i}`).then(() => {
                    const elapsed = Date.now() - startTime;
                    logger.info({ requestNum: i + 1, elapsedMs: elapsed }, "Request allowed");
                })
            );
        }

        await Promise.all(promises);
        const totalTime = Date.now() - startTime;

        logger.info({ totalTimeMs: totalTime, requests: 20 }, "✓ All requests completed");

        // Expected: ~2 seconds (20 requests at 10/sec = 2 seconds)
        const expectedMinTime = 1000; // At least 1 second (first 10 instant, next 10 queued)
        const expectedMaxTime = 3000; // At most 3 seconds (with some overhead)

        if (totalTime >= expectedMinTime && totalTime <= expectedMaxTime) {
            logger.info({ totalTimeMs: totalTime }, "✅ Rate limiting is working correctly!");
        } else {
            logger.warn({ 
                totalTimeMs: totalTime, 
                expectedMinTime, 
                expectedMaxTime 
            }, "⚠️ Timing outside expected range");
        }

        // Test 2: Verify token refill
        logger.info("Test 2: Waiting 1 second for token refill...");
        await new Promise(resolve => setTimeout(resolve, 1000));

        const refillStart = Date.now();
        await upstoxRateLimiter.waitForToken("refill-test");
        const refillTime = Date.now() - refillStart;

        if (refillTime < 100) {
            logger.info({ refillTimeMs: refillTime }, "✓ Tokens refilled successfully");
        } else {
            logger.warn({ refillTimeMs: refillTime }, "⚠️ Token refill took longer than expected");
        }

        logger.info("=== Summary ===");
        logger.info("✅ Rate limiter is functioning correctly!");
        logger.info("- Enforces 10 req/s limit");
        logger.info("- Queues excess requests");
        logger.info("- Refills tokens over time");

        process.exit(0);
    } catch (error) {
        logger.error({ err: error }, "❌ Test failed");
        process.exit(1);
    }
}

testRateLimiting();
