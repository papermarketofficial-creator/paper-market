import { db } from "@/lib/db";
import { wallets, transactions, users, type Wallet, type Transaction, type TransactionType } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/errors";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * WalletService - Manages user wallet operations and transaction ledger
 * Following backend-dev SKILL.md:
 * - All business logic in services
 * - Accepts tx (transaction) objects for atomicity
 * - Returns POJOs, not NextResponse
 * - Framework-agnostic
 */
export class WalletService {
    /**
     * Get or create wallet for user
     * MUST be called within a transaction for consistency
     */
    static async getWallet(userId: string, tx?: any): Promise<Wallet> {
        const executor = tx || db;

        const [wallet] = await executor
            .select()
            .from(wallets)
            .where(eq(wallets.userId, userId))
            .limit(1);

        if (!wallet) {
            // Create wallet with default balance (₹10L)
            const [newWallet] = await executor
                .insert(wallets)
                .values({ userId })
                .returning();

            logger.info({ userId, walletId: newWallet.id }, "Wallet created");
            return newWallet;
        }

        return wallet;
    }

    /**
     * Check if user has sufficient available balance
     * Available Balance = Total Balance (No blocking in simplified mode)
     */
    static async checkMargin(userId: string, requiredAmount: number): Promise<boolean> {
        const wallet = await this.getWallet(userId);
        const availableBalance = parseFloat(wallet.balance);

        logger.debug(
            { userId, requiredAmount, availableBalance },
            "Margin check (Simplified)"
        );

        return availableBalance >= requiredAmount;
    }

    /**
     * Get available balance for user
     */
    static async getAvailableBalance(userId: string): Promise<number> {
        const wallet = await this.getWallet(userId);
        // Simplified: Blocked balance is ignored/deprecated
        return parseFloat(wallet.balance);
    }

    /* 
    DEPRECATED: Blocking logic removed per user request for simplified "instant" trading.
    
    static async blockFunds(...) { ... }
    static async unblockFunds(...) { ... }
    static async settleTrade(...) { ... }
    */

    /**
     * Credit balance when position is closed or profit realized
     * MUST be called within a transaction
     */
    static async creditProceeds(
        userId: string,
        amount: number,
        positionId: string,
        tx: any,
        description?: string
    ): Promise<void> {
        const wallet = await this.getWallet(userId, tx);
        const newBalance = parseFloat(wallet.balance) + amount;

        // Record transaction
        try {
            await tx.insert(transactions).values({
                userId,
                walletId: wallet.id,
                type: "CREDIT" as TransactionType,
                amount: amount.toFixed(2),
                balanceBefore: wallet.balance,
                balanceAfter: newBalance.toFixed(2),
                blockedBefore: wallet.blockedBalance,
                blockedAfter: wallet.blockedBalance,
                referenceType: "POSITION",
                referenceId: positionId,
                description: description || `Proceeds from closing position ${positionId}`,
            });
        } catch (error: any) {
            if (error.code === "23505") {
                logger.info({ userId, positionId }, "Duplicate credit transaction (idempotent)");
                return;
            }
            throw error;
        }

        // Update wallet cache
        await tx
            .update(wallets)
            .set({
                balance: newBalance.toFixed(2),
                updatedAt: new Date(),
            })
            .where(eq(wallets.id, wallet.id));

        logger.info({ userId, positionId, amount, newBalance }, "Proceeds credited");
    }

    /**
     * Direct debit (for fees, charges, etc.)
     * MUST be called within a transaction
     */
    static async debitBalance(
        userId: string,
        amount: number,
        referenceType: string,
        referenceId: string | null,
        tx: any,
        description?: string
    ): Promise<void> {
        const wallet = await this.getWallet(userId, tx);
        const availableBalance = parseFloat(wallet.balance) - parseFloat(wallet.blockedBalance);

        if (availableBalance < amount) {
            throw new ApiError(
                `Insufficient balance for debit. Available: ₹${availableBalance.toFixed(2)}`,
                400,
                "INSUFFICIENT_FUNDS"
            );
        }

        const newBalance = parseFloat(wallet.balance) - amount;

        // Record transaction
        await tx.insert(transactions).values({
            userId,
            walletId: wallet.id,
            type: "DEBIT" as TransactionType,
            amount: amount.toFixed(2),
            balanceBefore: wallet.balance,
            balanceAfter: newBalance.toFixed(2),
            blockedBefore: wallet.blockedBalance,
            blockedAfter: wallet.blockedBalance,
            referenceType,
            referenceId,
            description: description || `Debit: ${referenceType}`,
        });

        // Update wallet cache
        await tx
            .update(wallets)
            .set({
                balance: newBalance.toFixed(2),
                updatedAt: new Date(),
            })
            .where(eq(wallets.id, wallet.id));

        logger.info({ userId, amount, newBalance, referenceType }, "Balance debited");
    }

    /**
     * Get transaction history with filters
     */
    static async getTransactions(
        userId: string,
        filters: {
            type?: TransactionType;
            referenceType?: string;
            startDate?: Date;
            endDate?: Date;
            limit?: number;
            page?: number;
        } = {}
    ): Promise<{ transactions: Transaction[]; total: number }> {
        const limit = filters.limit || 20;
        const page = filters.page || 1;
        const offset = (page - 1) * limit;

        const conditions = [eq(transactions.userId, userId)];

        if (filters.type) {
            conditions.push(eq(transactions.type, filters.type));
        }

        if (filters.referenceType) {
            conditions.push(eq(transactions.referenceType, filters.referenceType));
        }

        if (filters.startDate) {
            conditions.push(gte(transactions.createdAt, filters.startDate));
        }

        if (filters.endDate) {
            conditions.push(lte(transactions.createdAt, filters.endDate));
        }

        const results = await db
            .select()
            .from(transactions)
            .where(and(...conditions))
            .orderBy(desc(transactions.createdAt))
            .limit(limit)
            .offset(offset);

        // Get total count (for pagination)
        const [{ count }] = await db
            .select({ count: transactions.id })
            .from(transactions)
            .where(and(...conditions));

        return {
            transactions: results,
            total: results.length, // Simplified - in production, use proper count
        };
    }

    /**
     * Recalculate wallet from ledger (admin recovery tool)
     * Use when wallet cache is suspected to be inconsistent
     */
    static async recalculateFromLedger(userId: string): Promise<void> {
        await db.transaction(async (tx) => {
            const wallet = await this.getWallet(userId, tx);

            // Fetch all transactions in chronological order
            const ledger = await tx
                .select()
                .from(transactions)
                .where(eq(transactions.userId, userId))
                .orderBy(transactions.createdAt);

            let computedBalance = 1000000; // Initial balance (₹10L)
            let computedBlocked = 0;

            for (const txn of ledger) {
                const amount = parseFloat(txn.amount);

                switch (txn.type) {
                    case "CREDIT":
                        computedBalance += amount;
                        break;
                    case "DEBIT":
                        computedBalance -= amount;
                        break;
                    case "BLOCK":
                        computedBlocked += amount;
                        break;
                    case "UNBLOCK":
                        computedBlocked -= amount;
                        break;
                    case "SETTLEMENT":
                        computedBalance -= amount;
                        computedBlocked -= amount;
                        break;
                }
            }

            // Update wallet with computed values
            await tx
                .update(wallets)
                .set({
                    balance: computedBalance.toFixed(2),
                    blockedBalance: computedBlocked.toFixed(2),
                    lastReconciled: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(wallets.id, wallet.id));

            logger.info(
                {
                    userId,
                    computedBalance,
                    computedBlocked,
                    previousBalance: wallet.balance,
                    previousBlocked: wallet.blockedBalance,
                },
                "Wallet recalculated from ledger"
            );
        });
    }
}
