import { config } from 'dotenv';
import path from 'path';

// Load env files from root directory
config({ path: path.resolve(process.cwd(), '.env') });
config({ path: path.resolve(process.cwd(), '.env.local') });

import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

/**
 * Seed wallets for existing users
 * Creates a wallet with ₹10L initial balance for each user that doesn't have one
 * 
 * Usage: npx tsx scripts/seed-wallets.ts
 */
async function seedWallets() {
    try {
        logger.info("Starting wallet seeding...");

        // Get all existing wallets
        const existingWallets = await db.select().from(wallets);
        const existingUserIds = new Set(existingWallets.map(w => w.userId));

        logger.info({ existingWallets: existingWallets.length }, "Found existing wallets");

        // Get all users
        const { users } = await import("@/lib/db/schema");
        const allUsers = await db.select().from(users);

        logger.info({ totalUsers: allUsers.length }, "Found users");

        // Create wallets for users without one
        const usersNeedingWallet = allUsers.filter(u => !existingUserIds.has(u.id));

        if (usersNeedingWallet.length === 0) {
            logger.info("All users already have wallets. Nothing to seed.");
            return;
        }

        logger.info({ usersNeedingWallet: usersNeedingWallet.length }, "Creating wallets...");

        for (const user of usersNeedingWallet) {
            await db.insert(wallets).values({
                userId: user.id,
                balance: "1000000.00", // ₹10L
                blockedBalance: "0.00",
                currency: "INR",
            });

            logger.info({ userId: user.id, email: user.email }, "Wallet created");
        }

        logger.info({ created: usersNeedingWallet.length }, "Wallet seeding completed successfully");

    } catch (error) {
        logger.error({ err: error }, "Failed to seed wallets");
        throw error;
    } finally {
        process.exit(0);
    }
}

// Run the seeder
seedWallets();
