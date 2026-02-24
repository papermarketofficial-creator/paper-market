import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eq, inArray, or, and } from "drizzle-orm";
import {
    ledgerAccounts,
    ledgerEntries,
    orders,
    positions,
    trades,
    transactions,
    wallets,
    watchlistItems,
    watchlists,
    instruments,
} from "@/lib/db/schema";
import { handleError, ApiError } from "@/lib/errors";
import { WalletService } from "@/services/wallet.service";
import { bootstrapLedgerAccounts } from "@/services/ledger-bootstrap.service";
import { ledgerCacheService } from "@/services/ledger-cache.service";
import { LedgerService } from "@/services/ledger.service";
import { mtmEngineService } from "@/services/mtm-engine.service";

const RESET_BALANCE = "10000000.00";

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        const userId = session.user.id;
        console.log(`[RESET] Resetting account for user: ${userId}`);

        await db.transaction(async (tx) => {
            await tx.delete(trades).where(eq(trades.userId, userId));
            await tx.delete(orders).where(eq(orders.userId, userId));
            await tx.delete(positions).where(eq(positions.userId, userId));
            await tx.delete(watchlists).where(eq(watchlists.userId, userId));
            await tx.delete(transactions).where(eq(transactions.userId, userId));

            const accountRows = await tx
                .select({ id: ledgerAccounts.id })
                .from(ledgerAccounts)
                .where(eq(ledgerAccounts.userId, userId));
            const accountIds = accountRows.map((row) => row.id);

            if (accountIds.length > 0) {
                await tx
                    .delete(ledgerEntries)
                    .where(
                        or(
                            inArray(ledgerEntries.debitAccountId, accountIds),
                            inArray(ledgerEntries.creditAccountId, accountIds)
                        )
                    );
            }

            await tx.delete(ledgerAccounts).where(eq(ledgerAccounts.userId, userId));
            ledgerCacheService.invalidateUser(userId);

            const wallet = await WalletService.getWallet(userId, tx);

            await tx
                .update(wallets)
                .set({
                    balance: RESET_BALANCE,
                    equity: RESET_BALANCE,
                    marginStatus: "NORMAL",
                    accountState: "NORMAL",
                    blockedBalance: "0.00",
                    updatedAt: new Date(),
                })
                .where(eq(wallets.id, wallet.id));

            await tx.insert(transactions).values({
                userId,
                walletId: wallet.id,
                type: "CREDIT",
                amount: RESET_BALANCE,
                balanceBefore: "0.00",
                balanceAfter: RESET_BALANCE,
                blockedBefore: "0.00",
                blockedAfter: "0.00",
                description: "Account reset - initial deposit",
                referenceType: "SYSTEM",
                referenceId: crypto.randomUUID(),
            });

            await bootstrapLedgerAccounts(userId, tx);
            const resetReference = `USER_RESET_${Date.now()}`;
            await LedgerService.recordEntry(
                { userId, accountType: "CASH" },
                { userId, accountType: "REALIZED_PNL" },
                RESET_BALANCE,
                {
                    referenceType: "ADJUSTMENT",
                    referenceId: resetReference,
                    idempotencyKey: `ADJUSTMENT-${resetReference}-${userId}`,
                },
                tx
            );
            await WalletService.recalculateFromLedger(userId, tx);

            const topStocks = [
                "RELIANCE",
                "TCS",
                "HDFCBANK",
                "ICICIBANK",
                "INFY",
                "BHARTIARTL",
                "ITC",
                "LT",
                "AXISBANK",
                "SBIN",
            ];

            const foundInstruments = await tx
                .select({ instrumentToken: instruments.instrumentToken })
                .from(instruments)
                .where(
                    and(
                        inArray(instruments.tradingsymbol, topStocks),
                        eq(instruments.segment, "NSE_EQ"),
                        eq(instruments.exchange, "NSE")
                    )
                );

            if (foundInstruments.length > 0) {
                const [newWatchlist] = await tx
                    .insert(watchlists)
                    .values({
                        userId,
                        name: "Nifty 10",
                        isDefault: true,
                    })
                    .returning();

                if (newWatchlist) {
                    await tx.insert(watchlistItems).values(
                        foundInstruments.map((inst) => ({
                            watchlistId: newWatchlist.id,
                            instrumentToken: inst.instrumentToken,
                        }))
                    );
                }
            }
        });

        mtmEngineService.requestRefresh(userId);

        console.log(`[RESET] Account reset successful for user: ${userId}`);
        return NextResponse.json({
            success: true,
            message: "Account reset successfully. Wallet set to 1000000 and default watchlist created.",
            data: {
                balance: Number(RESET_BALANCE),
            },
        });
    } catch (error) {
        console.error("[RESET] Failed:", error);
        return handleError(error);
    }
}
