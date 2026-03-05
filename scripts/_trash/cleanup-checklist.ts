
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "@/lib/db";
import { watchlistItems, instruments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function cleanupWatchlistItems() {
  console.log("🧹 Cleaning up junk items from watchlist_items...");

  // Delete directly from watchlist_items where token is '123456'
  const result = await db
    .delete(watchlistItems)
    .where(eq(watchlistItems.instrumentToken, '123456'))
    .returning({ id: watchlistItems.id, token: watchlistItems.instrumentToken });

  if (result.length > 0) {
    console.log(`✅ Deleted ${result.length} junk watchlist items.`);
  } else {
    console.log("⚠️  No junk watchlist items found with token '123456'.");
  }

  // Also try to delete the instrument again
  console.log("🧹 Trying to delete instrument '123456' again...");
  const instResult = await db
    .delete(instruments)
    .where(eq(instruments.instrumentToken, '123456'))
    .returning({ token: instruments.instrumentToken });
    
  if (instResult.length > 0) {
     console.log("✅ Deleted junk instrument.");
  } else {
     console.log("⚠️  Still could not find/delete instrument '123456'.");
  }

  process.exit(0);
}

cleanupWatchlistItems();
