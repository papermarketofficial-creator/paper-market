import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgerAccounts, wallets, type LedgerAccountType } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { LedgerService } from "@/services/ledger.service";
import { ledgerCacheService } from "@/services/ledger-cache.service";

type TxLike = typeof db | any;

const ACCOUNT_TYPES: readonly LedgerAccountType[] = [
    "CASH",
    "MARGIN_BLOCKED",
    "UNREALIZED_PNL",
    "REALIZED_PNL",
    "FEES",
];

const DEFAULT_WALLET_BALANCE = LedgerService.normalizeAmount(
    process.env.DEFAULT_WALLET_BALANCE ?? "1000000"
);

function normalizeAmount(value: unknown): string {
    const normalized = LedgerService.normalizeAmount(String(value ?? "0"));
    return LedgerService.compare(normalized, "0") > 0 ? normalized : "0";
}

export async function bootstrapLedgerAccounts(userId: string, tx?: TxLike): Promise<void> {
    const executor = tx || db;

    await executor
        .insert(ledgerAccounts)
        .values(ACCOUNT_TYPES.map((accountType) => ({ userId, accountType })))
        .onConflictDoNothing({
            target: [ledgerAccounts.userId, ledgerAccounts.accountType],
        });

    await ledgerCacheService.warmUser(userId, executor);
}

export async function bootstrapUserLedgerState(userId: string, tx?: TxLike): Promise<void> {
    const executor = tx || db;
    await bootstrapLedgerAccounts(userId, executor);

    const [wallet] = await executor
        .select({
            balance: wallets.balance,
            blockedBalance: wallets.blockedBalance,
        })
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1);

    const totalBalance = normalizeAmount(wallet?.balance ?? DEFAULT_WALLET_BALANCE);
    const blockedBalance = normalizeAmount(wallet?.blockedBalance ?? "0");
    let freeCash = LedgerService.subtract(totalBalance, blockedBalance);
    if (LedgerService.compare(freeCash, "0") < 0) {
        freeCash = totalBalance;
    }

    if (LedgerService.compare(freeCash, "0") > 0) {
        await LedgerService.recordEntry(
            { userId, accountType: "CASH" },
            { userId, accountType: "REALIZED_PNL" },
            freeCash,
            {
                referenceType: "ADJUSTMENT",
                referenceId: `WALLET_BOOTSTRAP_CASH-${userId}`,
                idempotencyKey: `ADJUSTMENT-WALLET_BOOTSTRAP_CASH-${userId}`,
            },
            executor
        );
    }

    if (LedgerService.compare(blockedBalance, "0") > 0) {
        await LedgerService.recordEntry(
            { userId, accountType: "MARGIN_BLOCKED" },
            { userId, accountType: "REALIZED_PNL" },
            blockedBalance,
            {
                referenceType: "ADJUSTMENT",
                referenceId: `WALLET_BOOTSTRAP_MARGIN-${userId}`,
                idempotencyKey: `ADJUSTMENT-WALLET_BOOTSTRAP_MARGIN-${userId}`,
            },
            executor
        );
    }

    logger.info({ userId }, "Ledger bootstrap completed");
}

