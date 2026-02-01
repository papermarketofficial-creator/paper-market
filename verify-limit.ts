import 'dotenv/config';
import { upstoxRateLimiter } from "./lib/rate-limit";

async function verifyRateLimiter() {
    console.log("🚀 Starting Rate Limiter Stress Test...");
    console.log("🎯 Goal: Fire 50 requests. Expect them to take ~5 seconds (10/sec rate).");

    const start = Date.now();
    const totalRequests = 50;
    const promises = [];

    for (let i = 0; i < totalRequests; i++) {
        promises.push(
            upstoxRateLimiter.waitForToken(`req-${i}`).then(() => {
                const now = Date.now();
                // console.log(`   ✅ Request ${i} passed at ${(now - start) / 1000}s`);
                return now;
            })
        );
    }

    await Promise.all(promises);
    const end = Date.now();
    const duration = (end - start) / 1000;

    console.log("\n📊 Results:");
    console.log(`   Total Requests: ${totalRequests}`);
    console.log(`   Total Duration: ${duration.toFixed(2)} seconds`);
    console.log(`   Avg Rate:       ${(totalRequests / duration).toFixed(2)} req/sec`);

    if (duration > 4.5 && duration < 6.0) {
        console.log("\n✅ SUCCESS: Rate limiting is working perfectly!");
    } else {
        console.log("\n⚠️ WARNING: Duration unexpected. Check implementation.");
    }

    process.exit(0);
}

verifyRateLimiter();
