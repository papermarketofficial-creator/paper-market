import { asc, eq, inArray, or } from "drizzle-orm";
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
    balance_after: string;
    blockedBefore: string;
    blockedAfter: string;
    referenceType: string | null;
    referenceId: string | null;
    description: string | null;
    createdAt: Date;
    created_at: Date;
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

function toSignedCashDelta(type: LegacyTransactionType, amount: string): string {
    if (type === "CREDIT" || type === "UNBLOCK") {
        return amount;
    }

    if (type === "DEBIT" || type === "BLOCK") {
        return LedgerService.subtract("0", amount);
    }

    return "0";
}

function toSignedBlockedDelta(type: LegacyTransactionType, amount: string): string {
    if (type === "BLOCK") {
        return amount;
    }

    if (type === "UNBLOCK") {
        return LedgerService.subtract("0", amount);
    }

    return "0";
}

type WalletJournalOptions = {
    ledgerReferenceType?: LedgerReferenceType;
    skipWaj?: boolean;
    skipWalletSync?: boolean;
    wajOperationType?: WriteAheadOperationType;
    wajJournalId?: string;
    sequenceCollector?: number[];
    idempotencyKey?: string;
    isSettlement?: boolean; // When true, skips cash-sufficiency check (P&L loss covered by blocked margin)
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
        // Read from ledger (source of truth) — bypasses stale wallet cache
        const snapshot = await LedgerService.reconstructUserEquity(userId);
        return toNumber(snapshot.cash);
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

        // For P&L settlement debits, blocked margin already covers the loss — skip cash check
        if (!options.isSettlement) {
            const snapshot = await LedgerService.reconstructUserEquity(userId, tx);
            if (LedgerService.compare(snapshot.cash, normalizedAmount) < 0) {
                throw new ApiError(
                    `Insufficient balance. Available: ${snapshot.cash}`,
                    400,
                    "INSUFFICIENT_FUNDS"
                );
            }
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

        const rawEntries = await db
            .select({
                id: ledgerEntries.id,
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
            .where(
                or(
                    inArray(ledgerEntries.debitAccountId, accountIds),
                    inArray(ledgerEntries.creditAccountId, accountIds)
                )
            )
            .orderBy(asc(ledgerEntries.createdAt), asc(ledgerEntries.id));

        const currentSnapshot = await LedgerService.reconstructUserEquity(userId);
        let totalCashDelta = "0";
        let totalBlockedDelta = "0";

        const entriesWithDeltas = rawEntries.map((entry) => {
            const debitType = entry.debitType || "REALIZED_PNL";
            const creditType = entry.creditType || "REALIZED_PNL";
            const type = deriveTransactionType(debitType, creditType);
            const amount = LedgerService.normalizeAmount(entry.amount);
            const cashDelta = toSignedCashDelta(type, amount);
            const blockedDelta = toSignedBlockedDelta(type, amount);

            totalCashDelta = LedgerService.add(totalCashDelta, cashDelta);
            totalBlockedDelta = LedgerService.add(totalBlockedDelta, blockedDelta);

            return {
                ...entry,
                type,
                amount,
                cashDelta,
                blockedDelta,
            };
        });

        const openingCash = LedgerService.subtract(currentSnapshot.cash, totalCashDelta);
        const openingBlocked = LedgerService.subtract(currentSnapshot.marginBlocked, totalBlockedDelta);

        let runningCashDelta = "0";
        let runningBlockedDelta = "0";
        const computedTransactionsAsc: WalletTransactionView[] = entriesWithDeltas.map((entry) => {
            const cashBefore = LedgerService.add(openingCash, runningCashDelta);
            const blockedBefore = LedgerService.add(openingBlocked, runningBlockedDelta);
            // balanceBefore = running cash balance (BLOCK reduces cash; UNBLOCK increases cash)
            const balanceBefore = cashBefore;

            runningCashDelta = LedgerService.add(runningCashDelta, entry.cashDelta);
            runningBlockedDelta = LedgerService.add(runningBlockedDelta, entry.blockedDelta);

            const cashAfter = LedgerService.add(openingCash, runningCashDelta);
            const blockedAfter = LedgerService.add(openingBlocked, runningBlockedDelta);
            // balanceAfter = running cash balance after this transaction
            const balanceAfter = cashAfter;

            return {
                id: entry.id,
                userId,
                walletId: wallet.id,
                type: entry.type,
                amount: entry.amount,
                balanceBefore,
                balanceAfter,
                balance_after: balanceAfter,
                blockedBefore,
                blockedAfter,
                referenceType: entry.referenceType,
                referenceId: entry.referenceId,
                description: null,
                createdAt: entry.createdAt,
                created_at: entry.createdAt,
            } satisfies WalletTransactionView;
        });

        const requestedReferenceType = filters.referenceType
            ? toLedgerReferenceType(filters.referenceType)
            : undefined;

        const filteredTransactions = computedTransactionsAsc.filter((transaction) => {
            if (filters.type && transaction.type !== filters.type) {
                return false;
            }

            if (requestedReferenceType && transaction.referenceType !== requestedReferenceType) {
                return false;
            }

            if (filters.startDate && transaction.createdAt < filters.startDate) {
                return false;
            }

            if (filters.endDate && transaction.createdAt > filters.endDate) {
                return false;
            }

            return true;
        });

        const sortedTransactions = [...filteredTransactions].sort((a, b) => {
            const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
            if (timeDiff !== 0) return timeDiff;
            return b.id.localeCompare(a.id);
        });

        const limit = Math.max(1, Math.min(100, Number(filters.limit || 20)));
        const page = Math.max(1, Number(filters.page || 1));
        const offset = (page - 1) * limit;
        const transactions = sortedTransactions.slice(offset, offset + limit);

        return {
            transactions,
            total: filteredTransactions.length,
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
