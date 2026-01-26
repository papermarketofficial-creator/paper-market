import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export class PaymentService {
    /**
     * Check if user has sufficient funds (Transactional).
     * @param tx Drizzle transaction object
     * @param userId User ID
     * @param amount Amount to check
     */
    static async hasSufficientBalance(tx: any, userId: string, amount: number): Promise<boolean> {
        const [user] = await tx
            .select({ balance: users.balance })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1); // Lock for update? Drizzle doesn't support 'for update' easily in query builder without sql

        if (!user) throw new ApiError("User not found", 404, "USER_NOT_FOUND");

        return parseFloat(user.balance) >= amount;
    }

    /**
     * Deduct funds from user balance.
     * Throws error if insufficient funds.
     */
    static async deductFunds(tx: any, userId: string, amount: number, description: string) {
        if (amount <= 0) return; // No deduction needed

        // Atomic update: balance = balance - amount
        // We use sql operator to ensure atomicity at DB level
        const [updatedUser] = await tx
            .update(users)
            .set({
                balance: sql`${users.balance} - ${amount.toString()}`
            })
            .where(eq(users.id, userId))
            .returning({ balance: users.balance });

        if (parseFloat(updatedUser.balance) < 0) {
            // Rollback (will be handled by the caller transaction throwing error)
            throw new ApiError("Insufficient funds", 400, "INSUFFICIENT_FUNDS");
        }

        logger.info({ userId, amount, newBalance: updatedUser.balance }, `Funds deducted: ${description}`);
    }

    /**
     * Credit funds to user balance.
     */
    static async creditFunds(tx: any, userId: string, amount: number, description: string) {
        if (amount <= 0) return;

        const [updatedUser] = await tx
            .update(users)
            .set({
                balance: sql`${users.balance} + ${amount.toString()}`
            })
            .where(eq(users.id, userId))
            .returning({ balance: users.balance });

        logger.info({ userId, amount, newBalance: updatedUser.balance }, `Funds credited: ${description}`);
    }
}
