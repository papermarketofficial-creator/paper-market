import { db } from "@/lib/db";
import { trades } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

export class TradeService {
    /**
     * Get all trades for a user.
     */
    static async getUserTrades(userId: string) {
        try {
            const userTrades = await db
                .select()
                .from(trades)
                .where(eq(trades.userId, userId))
                .orderBy(desc(trades.executedAt));

            return userTrades;
        } catch (error) {
            logger.error({ err: error, userId }, "Failed to get user trades");
            throw error;
        }
    }
}
