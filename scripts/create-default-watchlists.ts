/**
 * Create Default Watchlists for Existing Users
 * Run this once after migration to seed default watchlists
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { WatchlistService } from "@/services/watchlist.service";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

async function createDefaultWatchlists() {
  try {
    logger.info("🌱 Creating default watchlists for existing users...");

    // Get all users
    const allUsers = await db.select({ id: users.id }).from(users);

    logger.info({ count: allUsers.length }, "Found users");

    let created = 0;
    let skipped = 0;

    for (const user of allUsers) {
      try {
        // Check if user already has a watchlist
        const existing = await WatchlistService.getUserWatchlists(user.id);
        
        if (existing.length > 0) {
          logger.info({ userId: user.id }, "User already has watchlists, skipping");
          skipped++;
          continue;
        }

        // Create default watchlist
        await WatchlistService.createDefaultWatchlist(user.id);
        created++;
        logger.info({ userId: user.id }, "Created default watchlist");
      } catch (error) {
        logger.error({ err: error, userId: user.id }, "Failed to create watchlist for user");
      }
    }

    logger.info({ created, skipped }, "✅ Default watchlists creation complete");
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, "❌ Failed to create default watchlists");
    process.exit(1);
  }
}

createDefaultWatchlists();
