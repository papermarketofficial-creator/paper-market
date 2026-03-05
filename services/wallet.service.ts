import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
    ledgerAccounts,
    ledgerEntries,
    wallets,
    type LedgerAccountType,
    type LedgerReferenceType,
    type Wallet,
} from "@/lib/db/schema";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { LedgerService } from "@/services/ledger.service";
import { WriteAheadJournalService } from "@/services/write-ahead-journal.service";
import type { WriteAheadOperationType } from "@/lib/db/schema";

type TxLike = typeof db | any;
type LegacyTransactionType = "CREDIT" | "DEBIT" | "BLOCK" | "UNBLOCK" | "SETTLEMENT";

const REFERENCE_TYPE_MAP: Record<string, LedgerReferenceType> = {
    TRADE: "TRADE",
    ORDER: "ORDER",
    LIQUIDATION: "LIQUIDATION",
    EXPIRY: "EXPIRY",
    ADJUSTMENT: "ADJUSTMENT",
    OPTION_PREMIUM_DEBIT: "OPTION_PREMIUM_DEBIT",
    OPTION_PREMIUM_CREDIT: "OPTION_PREMIUM_CREDIT",
    OPTION_MARGIN_BLOCK: "OPTION_MARGIN_BLOCK",
    OPTION_MARGIN_RELEASE: "OPTION_MARGIN_RELEASE",
    OPTION_REALIZED_PNL: "OPTION_REALIZED_PNL",
    DEPOSIT: "ADJUSTMENT",
    WITHDRAWAL: "ADJUSTMENT",
    MARGIN_BLOCK: "ORDER",
    FEE: "ADJUSTMENT",
};

function toLedgerReferenceType(raw?: string): LedgerReferenceType {
    const key = String(raw || "").trim().toUpperCase();
    return REFERENCE_TYPE_MAP[key] || "ADJUSTMENT";
}

function toAmountString(amount: string | number): string {
    return LedgerService.normalizeAmount(amount);
}

function toNumber(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function buildReferenceId(prefix: string, referenceId?: string | null): string {
    const normalized = String(referenceId || "").trim();
    if (!normalized) {
        throw new ApiError(
            `Reference ID is required for ${prefix}`,
            400,
            "IDEMPOTENCY_REFERENCE_REQUIRED"
        );
    }
    return normalized;
}

function buildLedgerIdempotencyKey(
    referenceType: LedgerReferenceType,
    referenceId: string,
    leg: string
): string {
    const normalizedRef = String(referenceId || "").trim();
    const normalizedLeg = String(leg || "").trim().toUpperCase();
    const normalizedType = String(referenceType || "").trim().toUpperCase();
    if (!normalizedRef || !normalizedLeg || !normalizedType) {
        throw new ApiError("Unable to build ledger idempotency key", 500, "LEDGER_IDEMPOTENCY_BUILD_FAILED");
    }
    return `${normalizedType}-${normalizedRef}-${normalizedLeg}`;
}

function ensurePositiveAmount(amount: string): void {
    if (LedgerService.compare(amount, "0") <= 0) {
        throw new ApiError("Amount must be positive", 400, "INVALID_AMOUNT");
    }
}

type TransactionQueryFilters = {
    type?: LegacyTransactionType;
    referenceType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    page?: number;
};

type WalletTransactionView = {
    id: string;
    userId: string;
    walletId: string;
    type: LegacyTransactionType;
    amount: string;
    balanceBefore: string;
    balanceAfter: string;
    blockedBefore: string;
    blockedAfter: string;
    referenceType: string | null;
    referenceId: string | null;
    description: string | null;
    createdAt: Date;
};

function deriveTransactionType(debitType: LedgerAccountType, creditType: LedgerAccountType): LegacyTransactionType {
    if (debitType === "MARGIN_BLOCKED" && creditType === "CASH") return "BLOCK";
    if (debitType === "CASH" && creditType === "MARGIN_BLOCKED") return "UNBLOCK";
    if (debitType === "CASH") return "CREDIT";
    if (creditType === "CASH") return "DEBIT";
    return "SETTLEMENT";
}

function deriveDebitAccountType(referenceType: string): LedgerAccountType {
    const normalized = String(referenceType || "").trim().toUpperCase();
    if (normalized === "MARGIN_BLOCK" || normalized === "OPTION_MARGIN_BLOCK") return "MARGIN_BLOCKED";
    if (normalized === "FEE") return "FEES";
    return "REALIZED_PNL";
}

function deriveWajOperationType(referenceType: string): WriteAheadOperationType {
    const normalized = String(referenceType || "").trim().toUpperCase();
    if (normalized === "DEPOSIT" || normalized === "WITHDRAWAL" || normalized === "ADJUSTMENT") {
        return "MANUAL_ADJUSTMENT";
    }
    return "LEDGER_ENTRY";
}

type WalletJournalOptions = {
    ledgerReferenceType?: LedgerReferenceType;
    skipWaj?: boolean;
    skipWalletSync?: boolean;
    wajOperationType?: WriteAheadOperationType;
    wajJournalId?: string;
    sequenceCollector?: number[];
    idempotencyKey?: string;
};

export class WalletService {
    static async createWallet(userId: string, tx?: TxLike): Promise<Wallet> {
        return this.getWallet(userId, tx);
    }

    static async getWallet(userId: string, tx?: TxLike): Promise<Wallet> {
        const executor = tx || db;
        let created = false;

        let [wallet] = await executor
            .select()
            .from(wallets)
            .where(eq(wallets.userId, userId))
            .limit(1);

        if (!wallet) {
            try {
                [wallet] = await executor
                    .insert(wallets)
                    .values({ userId })
                    .returning();
                created = true;
            } catch (error: any) {
                if (error?.code === "23505") {
                    const existing = await executor
                        .select()
                        .from(wallets)
                        .where(eq(wallets.userId, userId))
                        .limit(1);
                    wallet = existing[0];
                } else {
                    throw error;
                }
            }
        }

        if (!wallet) {
            throw new ApiError("Failed to initialize wallet", 500, "WALLET_INIT_FAILED");
        }

        if (created) {
            logger.info({ userId }, "Wallet row created");
        }
        return wallet;
    }

    static async checkMargin(userId: string, requiredAmount: number): Promise<boolean> {
        const available = await this.getAvailableBalance(userId);
        return available >= requiredAmount;
    }

    static async getAvailableBalance(userId: string): Promise<number> {
        const wallet = await this.getWallet(userId);
        const available = LedgerService.subtract(wallet.balance, wallet.blockedBalance);
        return toNumber(available);
    }

    static async creditBalance(
        userId: string,
        amount: number | string,
        referenceType: string,
        referenceId: string | null,
        description?: string,
        tx?: TxLike,
        options: WalletJournalOptions = {}
    ): Promise<void> {
        const normalizedAmount = toAmountString(amount);
        ensurePositiveAmount(normalizedAmount);

        const apply = async (executor: TxLike): Promise<void> => {
            await this.getWallet(userId, executor);
            const ledgerReferenceType = options.ledgerReferenceType || toLedgerReferenceType(referenceType);
            const ledgerReferenceId = buildReferenceId(`WALLET_CREDIT_${ledgerReferenceType}`, referenceId);
            const ledgerIdempotencyKey =
                options.idempotencyKey ||
                buildLedgerIdempotencyKey(ledgerReferenceType, ledgerReferenceId, "CREDIT");
            const shouldJournal = !options.skipWaj;

            let preparedJournalId: string | null = null;
            if (shouldJournal) {
                const prepared = await WriteAheadJournalService.prepare(
                    {
                        journalId: options.wajJournalId,
                        operationType: options.wajOperationType || deriveWajOperationType(referenceType),
                        userId,
                        referenceId: ledgerReferenceId,
                        payload: {
                            userId,
                            direction: "CREDIT",
                            amount: normalizedAmount,
                            referenceType,
                            referenceId: ledgerReferenceId,
                            idempotencyKey: ledgerIdempotencyKey,
                            description: description || null,
                        },
                    },
                    executor
                );
                preparedJournalId = prepared.journalId;
            }

            try {
                const entry = await LedgerService.recordEntry(
                    { userId, accountType: "CASH" },
                    { userId, accountType: "REALIZED_PNL" },
                    normalizedAmount,
                    {
                        referenceType: ledgerReferenceType,
                        referenceId: ledgerReferenceId,
                        idempotencyKey: ledgerIdempotencyKey,
                    },
                    executor
                );
                if (!entry.duplicate && options.sequenceCollector && entry.globalSequence > 0) {
                    options.sequenceCollector.push(entry.globalSequence);
                }

                if (!options.skipWalletSync) {
                    await this.syncWalletCacheFromLedger(userId, executor);
                }

                if (shouldJournal && preparedJournalId && !entry.duplicate) {
                    await WriteAheadJournalService.commit(preparedJournalId, executor, {
                        ledgerSequences: [entry.globalSequence],
                    });
                }

                logger.info(
                    {
                        event: "WALLET_LEDGER_CREDIT",
                        userId,
                        amount: normalizedAmount,
                        ledgerReferenceType,
                        ledgerReferenceId,
                        idempotencyKey: ledgerIdempotencyKey,
                        description: description || null,
                    },
                    "WALLET_LEDGER_CREDIT"
                );
            } catch (error) {
                if (shouldJournal && preparedJournalId) {
                    await WriteAheadJournalService.abort(
                        preparedJournalId,
                        executor,
                        error instanceof Error ? error.message : "WALLET_CREDIT_FAILED"
                    );
                }
                throw error;
            }
        };

        if (tx) {
            await apply(tx);
            return;
        }

        await db.transaction(async (transaction) => {
            await apply(transaction);
        });
    }

    static async creditProceeds(
        userId: string,
        amount: number | string,
        referenceId: string,
        tx: TxLike,
        description?: string,
        options: WalletJournalOptions = {}
    ): Promise<void> {
        const normalizedAmount = toAmountString(amount);
        ensurePositiveAmount(normalizedAmount);

        await this.getWallet(userId, tx);

        const ledgerReferenceType = options.ledgerReferenceType || "TRADE";
        const ledgerReferenceId = buildReferenceId(`WALLET_PROCEEDS_${ledgerReferenceType}`, referenceId);
        const ledgerIdempotencyKey =
            options.idempotencyKey ||
            buildLedgerIdempotencyKey(ledgerReferenceType, ledgerReferenceId, "CREDIT_PROCEEDS");
        const shouldJournal = !options.skipWaj;

        let preparedJournalId: string | null = null;
        if (shouldJournal) {
            const prepared = await WriteAheadJournalService.prepare(
                {
                    journalId: options.wajJournalId,
                    operationType: options.wajOperationType || "LEDGER_ENTRY",
                    userId,
                    referenceId: ledgerReferenceId,
                    payload: {
                        userId,
                        direction: "CREDIT_PROCEEDS",
                        amount: normalizedAmount,
                        referenceId: ledgerReferenceId,
                        ledgerReferenceType,
                        idempotencyKey: ledgerIdempotencyKey,
                        description: description || null,
                    },
                },
                tx
            );
            preparedJournalId = prepared.journalId;
        }

        try {
            const entry = await LedgerService.recordEntry(
                { userId, accountType: "CASH" },
                { userId, accountType: "REALIZED_PNL" },
                normalizedAmount,
                {
                    referenceType: ledgerReferenceType,
                    referenceId: ledgerReferenceId,
                    idempotencyKey: ledgerIdempotencyKey,
                },
                tx
            );
            if (!entry.duplicate && options.sequenceCollector && entry.globalSequence > 0) {
                options.sequenceCollector.push(entry.globalSequence);
            }

            if (!options.skipWalletSync) {
                await this.syncWalletCacheFromLedger(userId, tx);
            }
            if (shouldJournal && preparedJournalId && !entry.duplicate) {
                await WriteAheadJournalService.commit(preparedJournalId, tx, {
                    ledgerSequences: [entry.globalSequence],
                });
            }

            logger.info(
                {
                    event: "WALLET_LEDGER_PROCEEDS",
                    userId,
                    amount: normalizedAmount,
                    ledgerReferenceType,
                    ledgerReferenceId,
                    idempotencyKey: ledgerIdempotencyKey,
                    description: description || null,
                },
                "WALLET_LEDGER_PROCEEDS"
            );
        } catch (error) {
            if (shouldJournal && preparedJournalId) {
                await WriteAheadJournalService.abort(
                    preparedJournalId,
                    tx,
                    error instanceof Error ? error.message : "WALLET_PROCEEDS_FAILED"
                );
            }
            throw error;
        }
    }

    static async debitBalance(
        userId: string,
        amount: number | string,
        referenceType: string,
        referenceId: string | null,
        tx: TxLike,
        description?: string,
        options: WalletJournalOptions = {}
    ): Promise<void> {
        const normalizedAmount = toAmountString(amount);
        ensurePositiveAmount(normalizedAmount);

        await this.getWallet(userId, tx);

        const snapshot = await LedgerService.reconstructUserEquity(userId, tx);
        if (LedgerService.compare(snapshot.cash, normalizedAmount) < 0) {
            throw new ApiError(
                `Insufficient balance. Available: ${snapshot.cash}`,
                400,
                "INSUFFICIENT_FUNDS"
            );
        }

        const debitAccountType = deriveDebitAccountType(referenceType);
        const ledgerReferenceType = options.ledgerReferenceType || toLedgerReferenceType(referenceType);
        const ledgerReferenceId = buildReferenceId(`WALLET_DEBIT_${ledgerReferenceType}`, referenceId);
        const ledgerIdempotencyKey =
            options.idempotencyKey ||
            buildLedgerIdempotencyKey(ledgerReferenceType, ledgerReferenceId, `DEBIT_${debitAccountType}`);
        const shouldJournal = !options.skipWaj;

        let preparedJournalId: string | null = null;
        if (shouldJournal) {
            const prepared = await WriteAheadJournalService.prepare(
                {
                    journalId: options.wajJournalId,
                    operationType: options.wajOperationType || deriveWajOperationType(referenceType),
                    userId,
                    referenceId: ledgerReferenceId,
                    payload: {
                        userId,
                        direction: "DEBIT",
                        amount: normalizedAmount,
                        referenceType,
                        referenceId: ledgerReferenceId,
                        debitAccountType,
                        idempotencyKey: ledgerIdempotencyKey,
                        description: description || null,
                    },
                },
                tx
            );
            preparedJournalId = prepared.journalId;
        }

        try {
            const entry = await LedgerService.recordEntry(
                { userId, accountType: debitAccountType },
                { userId, accountType: "CASH" },
                normalizedAmount,
                {
                    referenceType: ledgerReferenceType,
                    referenceId: ledgerReferenceId,
                    idempotencyKey: ledgerIdempotencyKey,
                },
                tx
            );
            if (!entry.duplicate && options.sequenceCollector && entry.globalSequence > 0) {
                options.sequenceCollector.push(entry.globalSequence);
            }

            if (!options.skipWalletSync) {
                await this.syncWalletCacheFromLedger(userId, tx);
            }
            if (shouldJournal && preparedJournalId && !entry.duplicate) {
                await WriteAheadJournalService.commit(preparedJournalId, tx, {
                    ledgerSequences: [entry.globalSequence],
                });
            }

            logger.info(
                {
                    event: "WALLET_LEDGER_DEBIT",
                    userId,
                    amount: normalizedAmount,
                    debitAccountType,
                    ledgerReferenceType,
                    ledgerReferenceId,
                    idempotencyKey: ledgerIdempotencyKey,
                    description: description || null,
                },
                "WALLET_LEDGER_DEBIT"
            );
        } catch (error) {
            if (shouldJournal && preparedJournalId) {
                await WriteAheadJournalService.abort(
                    preparedJournalId,
                    tx,
                    error instanceof Error ? error.message : "WALLET_DEBIT_FAILED"
                );
            }
            throw error;
        }
    }

    static async releaseMarginBlock(
        userId: string,
        amount: number | string,
        referenceId: string,
        tx: TxLike,
        description?: string,
        options: WalletJournalOptions = {}
    ): Promise<void> {
        const normalizedAmount = toAmountString(amount);
        ensurePositiveAmount(normalizedAmount);

        await this.getWallet(userId, tx);

        const snapshot = await LedgerService.reconstructUserEquity(userId, tx);
        const releasableAmount =
            LedgerService.compare(snapshot.marginBlocked, normalizedAmount) < 0
                ? LedgerService.normalizeAmount(snapshot.marginBlocked)
                : normalizedAmount;

        if (LedgerService.compare(releasableAmount, "0") <= 0) {
            return;
        }

        const ledgerReferenceType = options.ledgerReferenceType || "TRADE";
        const ledgerReferenceId = buildReferenceId(`WALLET_UNBLOCK_${ledgerReferenceType}`, referenceId);
        const ledgerIdempotencyKey =
            options.idempotencyKey ||
            buildLedgerIdempotencyKey(ledgerReferenceType, ledgerReferenceId, "UNBLOCK_MARGIN");
        const shouldJournal = !options.skipWaj;

        let preparedJournalId: string | null = null;
        if (shouldJournal) {
            const prepared = await WriteAheadJournalService.prepare(
                {
                    journalId: options.wajJournalId,
                    operationType: options.wajOperationType || "LEDGER_ENTRY",
                    userId,
                    referenceId: ledgerReferenceId,
                    payload: {
                        userId,
                        direction: "MARGIN_UNBLOCK",
                        amount: releasableAmount,
                        referenceId: ledgerReferenceId,
                        ledgerReferenceType,
                        idempotencyKey: ledgerIdempotencyKey,
                        description: description || null,
                    },
                },
                tx
            );
            preparedJournalId = prepared.journalId;
        }

        try {
            const entry = await LedgerService.recordEntry(
                { userId, accountType: "CASH" },
                { userId, accountType: "MARGIN_BLOCKED" },
                releasableAmount,
                {
                    referenceType: ledgerReferenceType,
                    referenceId: ledgerReferenceId,
                    idempotencyKey: ledgerIdempotencyKey,
                },
                tx
            );
            if (!entry.duplicate && options.sequenceCollector && entry.globalSequence > 0) {
                options.sequenceCollector.push(entry.globalSequence);
            }

            if (!options.skipWalletSync) {
                await this.syncWalletCacheFromLedger(userId, tx);
            }
            if (shouldJournal && preparedJournalId && !entry.duplicate) {
                await WriteAheadJournalService.commit(preparedJournalId, tx, {
                    ledgerSequences: [entry.globalSequence],
                });
            }

            logger.info(
                {
                    event: "WALLET_MARGIN_UNBLOCKED",
                    userId,
                    amount: releasableAmount,
                    ledgerReferenceType,
                    ledgerReferenceId,
                    idempotencyKey: ledgerIdempotencyKey,
                    description: description || null,
                },
                "WALLET_MARGIN_UNBLOCKED"
            );
        } catch (error) {
            if (shouldJournal && preparedJournalId) {
                await WriteAheadJournalService.abort(
                    preparedJournalId,
                    tx,
                    error instanceof Error ? error.message : "WALLET_MARGIN_UNBLOCK_FAILED"
                );
            }
            throw error;
        }
    }

    static async getTransactions(
        userId: string,
        filters: TransactionQueryFilters = {}
    ): Promise<{ transactions: WalletTransactionView[]; total: number }> {
        const wallet = await this.getWallet(userId);

        const accounts = await db
            .select({
                id: ledgerAccounts.id,
                accountType: ledgerAccounts.accountType,
            })
            .from(ledgerAccounts)
            .where(eq(ledgerAccounts.userId, userId));

        const accountIds = accounts.map((row) => row.id);
        if (accountIds.length === 0) {
            return { transactions: [], total: 0 };
        }

        const debitAccounts = alias(ledgerAccounts, "debit_accounts");
        const creditAccounts = alias(ledgerAccounts, "credit_accounts");
        const transactionTypeCase = sql<string>`
            case
                when ${debitAccounts.accountType} = 'MARGIN_BLOCKED' and ${creditAccounts.accountType} = 'CASH' then 'BLOCK'
                when ${debitAccounts.accountType} = 'CASH' and ${creditAccounts.accountType} = 'MARGIN_BLOCKED' then 'UNBLOCK'
                when ${debitAccounts.accountType} = 'CASH' then 'CREDIT'
                when ${creditAccounts.accountType} = 'CASH' then 'DEBIT'
                else 'SETTLEMENT'
            end
        `;

        const whereConditions: any[] = [
            or(
                inArray(ledgerEntries.debitAccountId, accountIds),
                inArray(ledgerEntries.creditAccountId, accountIds)
            ),
        ];

        if (filters.referenceType) {
            whereConditions.push(eq(ledgerEntries.referenceType, toLedgerReferenceType(filters.referenceType)));
        }

        if (filters.startDate) {
            whereConditions.push(gte(ledgerEntries.createdAt, filters.startDate));
        }

        if (filters.endDate) {
            whereConditions.push(lte(ledgerEntries.createdAt, filters.endDate));
        }

        if (filters.type) {
            whereConditions.push(sql`${transactionTypeCase} = ${filters.type}`);
        }

        // PERFORMANCE FIX: Move pagination into SQL instead of loading all rows
        const limit = Math.max(1, Math.min(100, Number(filters.limit || 20)));
        const page = Math.max(1, Number(filters.page || 1));
        const offset = (page - 1) * limit;

        // Get total count first
        const [countRow] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(ledgerEntries)
            .innerJoin(debitAccounts, eq(ledgerEntries.debitAccountId, debitAccounts.id))
            .innerJoin(creditAccounts, eq(ledgerEntries.creditAccountId, creditAccounts.id))
            .where(and(...whereConditions));
        
        const totalCount = countRow?.count || 0;

        // Fetch only the page we need
        const rawEntries = await db
            .select({
                id: ledgerEntries.id,
                debitAccountId: ledgerEntries.debitAccountId,
                creditAccountId: ledgerEntries.creditAccountId,
                amount: ledgerEntries.amount,
                referenceType: ledgerEntries.referenceType,
                referenceId: ledgerEntries.referenceId,
                createdAt: ledgerEntries.createdAt,
                debitType: debitAccounts.accountType,
                creditType: creditAccounts.accountType,
            })
            .from(ledgerEntries)
            .innerJoin(debitAccounts, eq(ledgerEntries.debitAccountId, debitAccounts.id))
            .innerJoin(creditAccounts, eq(ledgerEntries.creditAccountId, creditAccounts.id))
            .where(and(...whereConditions))
            .orderBy(desc(ledgerEntries.createdAt))
            .limit(limit)
            .offset(offset);

        const transactions = rawEntries.map((entry) => {
            const debitType = entry.debitType || "REALIZED_PNL";
            const creditType = entry.creditType || "REALIZED_PNL";
            const type = deriveTransactionType(debitType, creditType);

            return {
                id: entry.id,
                userId,
                walletId: wallet.id,
                type,
                amount: LedgerService.normalizeAmount(entry.amount),
                balanceBefore: "0",
                balanceAfter: "0",
                blockedBefore: "0",
                blockedAfter: "0",
                referenceType: entry.referenceType,
                referenceId: entry.referenceId,
                description: null,
                createdAt: entry.createdAt,
            } satisfies WalletTransactionView;
        });

        return {
            transactions,
            total: totalCount,
        };
    }

    static async recalculateFromLedger(userId: string, tx?: TxLike): Promise<void> {
        if (tx) {
            await this.getWallet(userId, tx);
            await this.syncWalletCacheFromLedger(userId, tx);
            return;
        }

        await db.transaction(async (transaction) => {
            await this.getWallet(userId, transaction);
            await this.syncWalletCacheFromLedger(userId, transaction);
        });
    }

    private static async syncWalletCacheFromLedger(userId: string, tx: TxLike): Promise<void> {
        const snapshot = await LedgerService.reconstructUserEquity(userId, tx);
        const totalBalance = LedgerService.add(snapshot.cash, snapshot.marginBlocked);

        await tx
            .update(wallets)
            .set({
                balance: totalBalance,
                blockedBalance: snapshot.marginBlocked,
                equity: snapshot.equity,
                lastReconciled: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(wallets.userId, userId));
    }
}
