// Load environment variables FIRST
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/lib/db";
import { watchlistItems } from "@/lib/db/schema";
import { like } from "drizzle-orm";
import { logger } from "@/lib/logger";

async function checkWatchlistTokens() {
    try {
        logger.info("Checking Watchlist Items for invalid tokens...");
        
        // Check for mock ISINs in watchlist items
        const invalid = await db.select({
            id: watchlistItems.id,
            token: watchlistItems.instrumentToken
        })
        .from(watchlistItems)
        .where(like(watchlistItems.instrumentToken, "%XXXXXX%"));
        
        if (invalid.length > 0) {
            logger.warn({ count: invalid.length, examples: invalid.slice(0, 3) }, "⚠️ Found invalid tokens in WATCHLIST");
        } else {
            logger.info("✅ No invalid tokens in Watchlist Items.");
        }

        // Show ALL watchlist items to see what they look like
        const all = await db.select().from(watchlistItems);
        logger.info({ count: all.length }, "Total Watchlist Items");
        all.forEach(item => {
            logger.info(`- ${item.instrumentToken} (Watchlist: ${item.watchlistId})`);
        });

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkWatchlistTokens();
