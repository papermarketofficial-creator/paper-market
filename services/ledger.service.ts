import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
    ledgerAccounts,
    ledgerEntries,
    type LedgerAccountType,
    type LedgerReferenceType,
} from "@/lib/db/schema";
import { ApiError } from "@/lib/errors";

const LEDGER_SCALE = 8;
const LEDGER_FACTOR = BigInt(10) ** BigInt(LEDGER_SCALE);
const ACCOUNT_TYPES: readonly LedgerAccountType[] = [
    "CASH",
    "MARGIN_BLOCKED",
    "UNREALIZED_PNL",
    "REALIZED_PNL",
    "FEES",
];

type DecimalInput = string | number | bigint;
type TxExecutor = typeof db;
type TxLike = TxExecutor | any;

type LedgerAccountRef = {
    accountId?: string;
    userId?: string;
    accountType?: LedgerAccountType;
};

type LedgerReference = {
    referenceType: LedgerReferenceType;
    referenceId: string;
    idempotencyKey: string;
    currency?: string;
};

type UserLedgerSnapshot = {
    cash: string;
    marginBlocked: string;
    unrealizedPnl: string;
    realizedPnl: string;
    fees: string;
    equity: string;
};

function trimTrailingZeros(value: string): string {
    const normalized = value.replace(/\.?0+$/, "");
    return normalized.includes(".") ? normalized : normalized || "0";
}

function toScaledInteger(input: DecimalInput): bigint {
    const raw = typeof input === "bigint" ? input.toString() : String(input ?? "").trim();
    if (!raw) {
        throw new ApiError("Amount is required", 400, "LEDGER_INVALID_AMOUNT");
    }

    const negative = raw.startsWith("-");
    const unsigned = negative ? raw.slice(1) : raw;
    if (!/^\d+(\.\d+)?$/.test(unsigned)) {
        throw new ApiError("Amount must be a valid decimal", 400, "LEDGER_INVALID_AMOUNT");
    }

    const [wholePart, fractionalPart = ""] = unsigned.split(".");
    const fractional = (fractionalPart + "00000000").slice(0, LEDGER_SCALE);
    const scaled = BigInt(wholePart || "0") * LEDGER_FACTOR + BigInt(fractional || "0");
    return negative ? -scaled : scaled;
}

function fromScaledInteger(value: bigint): string {
    const zero = BigInt(0);
    const negative = value < zero;
    const unsigned = negative ? -value : value;
    const whole = unsigned / LEDGER_FACTOR;
    const fraction = (unsigned % LEDGER_FACTOR).toString().padStart(LEDGER_SCALE, "0");
    const compact = trimTrailingZeros(`${whole}.${fraction}`);
    return negative ? `-${compact}` : compact;
}

export class LedgerService {
    static normalizeAmount(value: DecimalInput): string {
        return fromScaledInteger(toScaledInteger(value));
    }

    static add(a: DecimalInput, b: DecimalInput): string {
        return fromScaledInteger(toScaledInteger(a) + toScaledInteger(b));
    }

    static subtract(a: DecimalInput, b: DecimalInput): string {
        return fromScaledInteger(toScaledInteger(a) - toScaledInteger(b));
    }

    static compare(a: DecimalInput, b: DecimalInput): number {
        const left = toScaledInteger(a);
        const right = toScaledInteger(b);
        if (left === right) return 0;
        return left > right ? 1 : -1;
    }

    static multiplyByInteger(amount: DecimalInput, quantity: number): string {
        if (!Number.isInteger(quantity) || quantity < 0) {
            throw new ApiError("Quantity must be a non-negative integer", 400, "LEDGER_INVALID_QUANTITY");
        }
        return fromScaledInteger(toScaledInteger(amount) * BigInt(quantity));
    }

    static async ensureUserAccounts(userId: string, tx?: TxLike): Promise<void> {
        const executor = tx || db;
        await Promise.all(
            ACCOUNT_TYPES.map((accountType) =>
                executor
                    .insert(ledgerAccounts)
                    .values({ userId, accountType })
                    .onConflictDoNothing({
                        target: [ledgerAccounts.userId, ledgerAccounts.accountType],
                    })
            )
        );
    }

    static async recordEntry(
        debitAccount: LedgerAccountRef,
        creditAccount: LedgerAccountRef,
        amount: DecimalInput,
        reference: LedgerReference,
        tx?: TxLike
    ): Promise<{ entryId: string; amount: string; globalSequence: number }> {
        const executor = tx || db;
        const normalizedAmount = this.normalizeAmount(amount);
        if (this.compare(normalizedAmount, "0") <= 0) {
            throw new ApiError("Ledger amount must be positive", 400, "LEDGER_INVALID_AMOUNT");
        }
        const normalizedIdempotencyKey = String(reference.idempotencyKey || "").trim();
        if (!normalizedIdempotencyKey) {
            throw new ApiError("Ledger idempotency key is required", 400, "LEDGER_IDEMPOTENCY_REQUIRED");
        }

        const [debitId, creditId] = await Promise.all([
            this.resolveAccountId(debitAccount, executor),
            this.resolveAccountId(creditAccount, executor),
        ]);

        if (!debitId || !creditId || debitId === creditId) {
            throw new ApiError("Invalid ledger account mapping", 400, "LEDGER_ACCOUNT_MAPPING_INVALID");
        }

        const [entry] = await executor
            .insert(ledgerEntries)
            .values({
                debitAccountId: debitId,
                creditAccountId: creditId,
                amount: normalizedAmount,
                currency: (reference.currency || "INR").toUpperCase(),
                referenceType: reference.referenceType,
                referenceId: reference.referenceId,
                idempotencyKey: normalizedIdempotencyKey,
            })
            .onConflictDoNothing({
                target: [ledgerEntries.idempotencyKey],
            })
            .returning({
                id: ledgerEntries.id,
                globalSequence: ledgerEntries.globalSequence,
            });

        if (entry?.id && Number.isFinite(Number(entry.globalSequence))) {
            return {
                entryId: entry.id,
                amount: normalizedAmount,
                globalSequence: Number(entry.globalSequence),
            };
        }

        const [existing] = await executor
            .select({
                id: ledgerEntries.id,
                globalSequence: ledgerEntries.globalSequence,
                debitAccountId: ledgerEntries.debitAccountId,
                creditAccountId: ledgerEntries.creditAccountId,
                amount: ledgerEntries.amount,
                referenceType: ledgerEntries.referenceType,
                referenceId: ledgerEntries.referenceId,
            })
            .from(ledgerEntries)
            .where(eq(ledgerEntries.idempotencyKey, normalizedIdempotencyKey))
            .limit(1);

        if (!existing?.id || !Number.isFinite(Number(existing.globalSequence))) {
            throw new ApiError("Failed to record ledger entry", 500, "LEDGER_WRITE_FAILED");
        }
        const matchesIntent =
            existing.debitAccountId === debitId &&
            existing.creditAccountId === creditId &&
            this.compare(existing.amount, normalizedAmount) === 0 &&
            existing.referenceType === reference.referenceType &&
            existing.referenceId === reference.referenceId;
        if (!matchesIntent) {
            throw new ApiError(
                "Ledger idempotency conflict: key reused with different mutation intent",
                409,
                "LEDGER_IDEMPOTENCY_CONFLICT"
            );
        }

        return {
            entryId: existing.id,
            amount: normalizedAmount,
            globalSequence: Number(existing.globalSequence),
        };
    }

    static async getAccountBalance(accountId: string, tx?: TxLike): Promise<string> {
        const executor = tx || db;
        const [row] = await executor
            .select({
                balance: sql<string>`
                    coalesce(
                        sum(
                            case
                                when ${ledgerEntries.debitAccountId} = ${accountId} then ${ledgerEntries.amount}::numeric
                                else -${ledgerEntries.amount}::numeric
                            end
                        ),
                        0
                    )::text
                `,
            })
            .from(ledgerEntries)
            .where(
                or(
                    eq(ledgerEntries.debitAccountId, accountId),
                    eq(ledgerEntries.creditAccountId, accountId)
                )
            );

        return this.normalizeAmount(row?.balance ?? "0");
    }

    static async reconstructUserEquity(userId: string, tx?: TxLike): Promise<UserLedgerSnapshot> {
        const executor = tx || db;
        await this.ensureUserAccounts(userId, executor);

        const accountRows = await executor
            .select({
                id: ledgerAccounts.id,
                accountType: ledgerAccounts.accountType,
            })
            .from(ledgerAccounts)
            .where(eq(ledgerAccounts.userId, userId));

        const accountIds = accountRows.map((r: { id: string; accountType: LedgerAccountType }) => r.id);
        if (accountIds.length === 0) {
            return {
                cash: "0",
                marginBlocked: "0",
                unrealizedPnl: "0",
                realizedPnl: "0",
                fees: "0",
                equity: "0",
            };
        }

        const balanceRows = await executor
            .select({
                accountId: ledgerAccounts.id,
                accountType: ledgerAccounts.accountType,
                balance: sql<string>`
                    coalesce(
                        sum(
                            case
                                when ${ledgerEntries.debitAccountId} = ${ledgerAccounts.id} then ${ledgerEntries.amount}::numeric
                                when ${ledgerEntries.creditAccountId} = ${ledgerAccounts.id} then -${ledgerEntries.amount}::numeric
                                else 0
                            end
                        ),
                        0
                    )::text
                `,
            })
            .from(ledgerAccounts)
            .leftJoin(
                ledgerEntries,
                or(
                    eq(ledgerEntries.debitAccountId, ledgerAccounts.id),
                    eq(ledgerEntries.creditAccountId, ledgerAccounts.id)
                )
            )
            .where(inArray(ledgerAccounts.id, accountIds))
            .groupBy(ledgerAccounts.id, ledgerAccounts.accountType);

        const byType = new Map<LedgerAccountType, string>();
        for (const row of balanceRows) {
            byType.set(row.accountType, this.normalizeAmount(row.balance || "0"));
        }

        const cash = byType.get("CASH") || "0";
        const marginBlocked = byType.get("MARGIN_BLOCKED") || "0";
        const unrealized = byType.get("UNREALIZED_PNL") || "0";
        const realized = byType.get("REALIZED_PNL") || "0";
        const fees = byType.get("FEES") || "0";

        const equity = this.add(this.add(cash, marginBlocked), unrealized);

        return {
            cash,
            marginBlocked,
            unrealizedPnl: unrealized,
            realizedPnl: realized,
            fees,
            equity,
        };
    }

    static async getAccountIdByType(
        userId: string,
        accountType: LedgerAccountType,
        tx?: TxLike
    ): Promise<string> {
        const executor = tx || db;
        await this.ensureUserAccounts(userId, executor);

        const [row] = await executor
            .select({ id: ledgerAccounts.id })
            .from(ledgerAccounts)
            .where(
                and(
                    eq(ledgerAccounts.userId, userId),
                    eq(ledgerAccounts.accountType, accountType)
                )
            )
            .limit(1);

        if (!row?.id) {
            throw new ApiError("Ledger account missing", 500, "LEDGER_ACCOUNT_MISSING");
        }
        return row.id;
    }

    private static async resolveAccountId(ref: LedgerAccountRef, tx: TxLike): Promise<string> {
        if (ref.accountId) return ref.accountId;
        if (!ref.userId || !ref.accountType) {
            throw new ApiError("Ledger account reference is invalid", 400, "LEDGER_ACCOUNT_REF_INVALID");
        }
        return this.getAccountIdByType(ref.userId, ref.accountType, tx);
    }
}
