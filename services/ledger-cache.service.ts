import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ledgerAccounts, type LedgerAccountType } from "@/lib/db/schema";
import { ApiError } from "@/lib/errors";

type TxLike = typeof db | any;

const REQUIRED_ACCOUNT_TYPES: readonly LedgerAccountType[] = [
    "CASH",
    "MARGIN_BLOCKED",
    "UNREALIZED_PNL",
    "REALIZED_PNL",
    "FEES",
];

export type LedgerAccountSet = Record<LedgerAccountType, string>;

export class LedgerCacheService {
    private readonly cache = new Map<string, LedgerAccountSet>();
    private readonly inflight = new Map<string, Promise<LedgerAccountSet>>();

    invalidateUser(userId: string): void {
        this.cache.delete(userId);
        this.inflight.delete(userId);
    }

    async warmUser(userId: string, tx?: TxLike): Promise<LedgerAccountSet> {
        return this.getAccountSet(userId, tx);
    }

    async getAccountSet(userId: string, tx?: TxLike): Promise<LedgerAccountSet> {
        const cached = this.cache.get(userId);
        if (cached) return cached;

        const existingPromise = this.inflight.get(userId);
        if (existingPromise) return existingPromise;

        const executor = tx || db;
        const promise = (async () => {
            const rows = await executor
                .select({
                    id: ledgerAccounts.id,
                    accountType: ledgerAccounts.accountType,
                })
                .from(ledgerAccounts)
                .where(eq(ledgerAccounts.userId, userId));

            const byType = new Map<LedgerAccountType, string>();
            for (const row of rows) {
                byType.set(row.accountType, row.id);
            }

            for (const accountType of REQUIRED_ACCOUNT_TYPES) {
                if (!byType.has(accountType)) {
                    throw new ApiError(
                        `Fatal ledger invariant violated for user ${userId}: missing ${accountType}`,
                        500,
                        "LEDGER_ACCOUNTS_NOT_BOOTSTRAPPED"
                    );
                }
            }

            const accountSet: LedgerAccountSet = {
                CASH: byType.get("CASH")!,
                MARGIN_BLOCKED: byType.get("MARGIN_BLOCKED")!,
                UNREALIZED_PNL: byType.get("UNREALIZED_PNL")!,
                REALIZED_PNL: byType.get("REALIZED_PNL")!,
                FEES: byType.get("FEES")!,
            };
            this.cache.set(userId, accountSet);
            return accountSet;
        })();

        this.inflight.set(userId, promise);
        try {
            return await promise;
        } finally {
            this.inflight.delete(userId);
        }
    }

    async getAccountIdByType(userId: string, accountType: LedgerAccountType, tx?: TxLike): Promise<string> {
        const set = await this.getAccountSet(userId, tx);
        return set[accountType];
    }
}

declare global {
    var __ledgerCacheService: LedgerCacheService | undefined;
}

const globalState = globalThis as unknown as { __ledgerCacheService?: LedgerCacheService };
export const ledgerCacheService = globalState.__ledgerCacheService || new LedgerCacheService();
globalState.__ledgerCacheService = ledgerCacheService;
