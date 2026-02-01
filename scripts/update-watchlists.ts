import 'dotenv/config';
import { db } from "@/lib/db";
import { watchlists, watchlistItems, instruments } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";

const TOP_STOCKS = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 
    'BHARTIARTL', 'SBIN', 'ITC', 'HINDUNILVR', 'LT',
    'TATAMOTORS', 'AXISBANK'
];

async function migrateWatchlists() {
    console.log("🚀 Starting Watchlist Migration...");

    try {
        // 1. Find all Default watchlists named "My Watchlist"
        const targetWatchlists = await db
            .select()
            .from(watchlists)
            .where(and(
                eq(watchlists.isDefault, true),
                eq(watchlists.name, 'My Watchlist')
            ));
        
        console.log(`📋 Found ${targetWatchlists.length} watchlists to migrate.`);

        // 2. Resolve Instrument Tokens for Top Stocks
        const topInstruments = await db
            .select({ 
                token: instruments.instrumentToken,
                symbol: instruments.tradingsymbol 
            })
            .from(instruments)
            .where(inArray(instruments.tradingsymbol, TOP_STOCKS));
        
        console.log(`✅ Resolved ${topInstruments.length} top instruments.`);

        for (const wl of targetWatchlists) {
            console.log(`🔹 Migrating Watchlist ID: ${wl.id} (User: ${wl.userId})`);

            // A. Update Name
            await db
                .update(watchlists)
                .set({ name: 'Top 10 Stocks' })
                .where(eq(watchlists.id, wl.id));
            
            // B. Get Existing Items
            const existingItems = await db
                .select({ token: watchlistItems.instrumentToken })
                .from(watchlistItems)
                .where(eq(watchlistItems.watchlistId, wl.id));
            
            const existingTokens = new Set(existingItems.map(i => i.token));

            // C. Add Missing Top Stocks
            const newItems = topInstruments
                .filter(inst => !existingTokens.has(inst.token))
                .map(inst => ({
                    watchlistId: wl.id,
                    instrumentToken: inst.token
                }));
            
            if (newItems.length > 0) {
                await db.insert(watchlistItems).values(newItems);
                console.log(`   ➕ Added ${newItems.length} new stocks.`);
            } else {
                console.log(`   ✨ Watchlist already has all top stocks.`);
            }
        }

        console.log("✅ Migration Complete!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Migration Failed:", error);
        process.exit(1);
    }
}

migrateWatchlists();
