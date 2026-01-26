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
     * Available Balance = Total Balance - Blocked Balance
     */
    static async checkMargin(userId: string, requiredAmount: number): Promise<boolean> {
        const wallet = await this.getWallet(userId);
        const availableBalance = parseFloat(wallet.balance) - parseFloat(wallet.blockedBalance);

        logger.debug(
            { userId, requiredAmount, availableBalance, blocked: wallet.blockedBalance },
            "Margin check"
        );

        return availableBalance >= requiredAmount;
    }

    /**
     * Get available balance for user
     */
    static async getAvailableBalance(userId: string): Promise<number> {
        const wallet = await this.getWallet(userId);
        return parseFloat(wallet.balance) - parseFloat(wallet.blockedBalance);
    }

    /**
     * Block funds when order is placed
     * MUST be called within a transaction
     * 
     * @throws ApiError if insufficient balance
     */
    static async blockFunds(
        userId: string,
        amount: number,
        orderId: string,
        tx: any,
        description?: string
    ): Promise<void> {
        const wallet = await this.getWallet(userId, tx);
        const availableBalance = parseFloat(wallet.balance) - parseFloat(wallet.blockedBalance);

        if (availableBalance < amount) {
            throw new ApiError(
                `Insufficient balance. Available: ₹${availableBalance.toFixed(2)}, Required: ₹${amount.toFixed(2)}`,
                400,
                "INSUFFICIENT_FUNDS"
            );
        }

        // Record transaction (idempotency enforced by DB constraint)
        try {
            await tx.insert(transactions).values({
                userId,
                walletId: wallet.id,
                type: "BLOCK" as TransactionType,
                amount: amount.toFixed(2),
                balanceBefore: wallet.balance,
                balanceAfter: wallet.balance, // Balance unchanged
                blockedBefore: wallet.blockedBalance,
                blockedAfter: (parseFloat(wallet.blockedBalance) + amount).toFixed(2),
                referenceType: "ORDER",
                referenceId: orderId,
                description: description || `Blocked funds for order ${orderId}`,
            });
        } catch (error: any) {
            // If unique constraint violation, this is an idempotent retry - skip silently
            if (error.code === "23505") {
                logger.info({ userId, orderId }, "Duplicate block funds transaction (idempotent)");
                return;
            }
            throw error;
        }

        // Update wallet cache
        await tx
            .update(wallets)
            .set({
                blockedBalance: (parseFloat(wallet.blockedBalance) + amount).toFixed(2),
                updatedAt: new Date(),
            })
            .where(eq(wallets.id, wallet.id));

        logger.info({ userId, orderId, amount, newBlocked: parseFloat(wallet.blockedBalance) + amount }, "Funds blocked");
    }

    /**
     * Release blocked funds when order is cancelled
     * MUST be called within a transaction
     */
    static async unblockFunds(
        userId: string,
        amount: number,
        orderId: string,
        tx: any,
        description?: string
    ): Promise<void> {
        const wallet = await this.getWallet(userId, tx);

        // Validate sufficient blocked funds exist
        if (parseFloat(wallet.blockedBalance) < amount) {
            logger.error(
                { userId, orderId, blockedBalance: wallet.blockedBalance, requestedAmount: amount },
                "Insufficient blocked balance - wallet inconsistency detected"
            );
            throw new ApiError(
                "Insufficient blocked balance - wallet inconsistency",
                500,
                "WALLET_INCONSISTENCY"
            );
        }

        // Record transaction
        try {
            await tx.insert(transactions).values({
                userId,
                walletId: wallet.id,
                type: "UNBLOCK" as TransactionType,
                amount: amount.toFixed(2),
                balanceBefore: wallet.balance,
                balanceAfter: wallet.balance,
                blockedBefore: wallet.blockedBalance,
                blockedAfter: (parseFloat(wallet.blockedBalance) - amount).toFixed(2),
                referenceType: "ORDER",
                referenceId: orderId,
                description: description || `Released blocked funds for cancelled order ${orderId}`,
            });
        } catch (error: any) {
            if (error.code === "23505") {
                logger.info({ userId, orderId }, "Duplicate unblock funds transaction (idempotent)");
                return;
            }
            throw error;
        }

        // Update wallet cache
        await tx
            .update(wallets)
            .set({
                blockedBalance: (parseFloat(wallet.blockedBalance) - amount).toFixed(2),
                updatedAt: new Date(),
            })
            .where(eq(wallets.id, wallet.id));

        logger.info({ userId, orderId, amount }, "Funds unblocked");
    }

    /**
     * Settle trade: Convert BLOCK → DEBIT (order executed)
     * MUST be called within a transaction
     * 
     * This decreases BOTH balance AND blockedBalance
     */
    static async settleTrade(
        userId: string,
        amount: number,
        tradeId: string,
        tx: any,
        description?: string
    ): Promise<void> {
        const wallet = await this.getWallet(userId, tx);

        // CRITICAL: Validate sufficient blocked funds exist
        if (parseFloat(wallet.blockedBalance) < amount) {
            logger.error(
                { userId, tradeId, blockedBalance: wallet.blockedBalance, settlementAmount: amount },
                "Settlement failed: insufficient blocked balance"
            );
            throw new ApiError(
                "Settlement failed: insufficient blocked balance - wallet inconsistency",
                500,
                "WALLET_INCONSISTENCY"
            );
        }

        // SETTLEMENT = decrease both balance AND blockedBalance
        const newBalance = parseFloat(wallet.balance) - amount;
        const newBlocked = parseFloat(wallet.blockedBalance) - amount;

        // Record transaction
        try {
            await tx.insert(transactions).values({
                userId,
                walletId: wallet.id,
                type: "SETTLEMENT" as TransactionType,
                amount: amount.toFixed(2),
                balanceBefore: wallet.balance,
                balanceAfter: newBalance.toFixed(2),
                blockedBefore: wallet.blockedBalance,
                blockedAfter: newBlocked.toFixed(2),
                referenceType: "TRADE",
                referenceId: tradeId,
                description: description || `Settlement for trade ${tradeId}`,
            });
        } catch (error: any) {
            if (error.code === "23505") {
                logger.info({ userId, tradeId }, "Duplicate settlement transaction (idempotent)");
                return;
            }
            throw error;
        }

        // Update wallet cache
        await tx
            .update(wallets)
            .set({
                balance: newBalance.toFixed(2),
                blockedBalance: newBlocked.toFixed(2),
                updatedAt: new Date(),
            })
            .where(eq(wallets.id, wallet.id));

        logger.info({ userId, tradeId, amount, newBalance, newBlocked }, "Trade settled");
    }

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
