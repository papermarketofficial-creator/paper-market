import { config } from "dotenv";
import fs from "fs";
import path from "path";

// 1. Force load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
    config({ path: envPath });
    console.log("✅ Loaded .env.local");
} else {
    console.error("❌ .env.local not found at", envPath);
    process.exit(1);
}

// 2. Dynamic Imports
async function main() {
    const { db } = await import("@/lib/db");
    const { users, trades } = await import("@/lib/db/schema");
    const { TradeService } = await import("@/services/trade.service");
    const { eq } = await import("drizzle-orm");

    console.log("📜 Testing Trades history API...");

    const TEST_EMAIL = "wallet_test@example.com";
    const user = await db.query.users.findFirst({
        where: eq(users.email, TEST_EMAIL)
    });

    if (!user) {
        console.error("User not found (Run wallet/positions test first)");
        process.exit(1);
    }

    // Call Service
    const userTrades = await TradeService.getUserTrades(user.id);

    console.log(`\nFound ${userTrades.length} trades for user.`);

    if (userTrades.length > 0) {
        console.table(userTrades.map(t => ({
            symbol: t.symbol,
            side: t.side,
            qty: t.quantity,
            price: t.price,
            time: t.executedAt
        })));
        console.log("✅ Trades API working correctly.");
    } else {
        console.warn("⚠️ No trades found. Run positions test first to generate a trade.");
    }

    process.exit(0);
}

main().catch(console.error);
