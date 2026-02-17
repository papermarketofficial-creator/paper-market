
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { orders, trades, positions } from "@/lib/db/schema/oms.schema";
import { transactions, wallets } from "@/lib/db/schema/wallet.schema";
import { watchlists, watchlistItems } from "@/lib/db/schema/watchlist.schema";
import { instruments } from "@/lib/db/schema/market.schema";
import { handleError, ApiError } from "@/lib/errors";

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        const userId = session.user.id;

        console.log(`[RESET] Resetting account for user: ${userId}`);

        // Execute as a transaction to ensure atomicity
        await db.transaction(async (tx) => {
            // 1. Delete dependent data first (Children before Parents)
            
            // Trades (Child of Orders)
            await tx.delete(trades).where(eq(trades.userId, userId));
            
            // Orders (Parent of Trades)
            await tx.delete(orders).where(eq(orders.userId, userId));
            
            // Positions (Independent child of User)
            await tx.delete(positions).where(eq(positions.userId, userId));
            
            // Watchlists (Cascade deletes items)
            await tx.delete(watchlists).where(eq(watchlists.userId, userId));

            // Wallet Transactions (Ledger)
            await tx.delete(transactions).where(eq(transactions.userId, userId));

            // 2. Reset Wallet Balance
            const userWallet = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);

            if (userWallet && userWallet.length > 0) {
                const walletId = userWallet[0].id;

                await tx.update(wallets)
                    .set({
                        balance: '1000000.00', // Reset to 10 Lakh
                        equity: '1000000.00',
                        marginStatus: 'NORMAL',
                        accountState: 'NORMAL',
                        blockedBalance: '0.00',
                        updatedAt: new Date()
                    })
                    .where(eq(wallets.id, walletId));
                
                // Add initial deposit transaction
                await tx.insert(transactions).values({
                    userId: userId,
                    walletId: walletId,
                    type: 'CREDIT',
                    amount: '100000.00',
                    balanceBefore: '0.00', // Starting fresh
                    balanceAfter: '100000.00',
                    blockedBefore: '0.00',
                    blockedAfter: '0.00',
                    description: 'Account Reset - Initial Deposit',
                    referenceType: 'SYSTEM',
                    referenceId: crypto.randomUUID() // Valid UUID
                });

                // 3. Create Default Watchlist with Top 10 Stocks
                const topStocks = [
                    'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 
                    'BHARTIARTL', 'ITC', 'LT', 'AXISBANK', 'SBIN'
                ];

                // Find instrument tokens
                const foundInstruments = await tx.query.instruments.findMany({
                    where: (t, { inArray, eq, and }) => and(
                        inArray(t.tradingsymbol, topStocks),
                        eq(t.segment, 'NSE_EQ'),
                        eq(t.exchange, 'NSE')
                    ),
                    columns: {
                        instrumentToken: true,
                    }
                });

                if (foundInstruments.length > 0) {
                    // Create Watchlist
                    const [newWatchlist] = await tx.insert(watchlists).values({
                        userId: userId,
                        name: 'Nifty 10',
                        isDefault: true,
                    }).returning();

                    // Add Items
                    if (newWatchlist) {
                        await tx.insert(watchlistItems).values(
                            foundInstruments.map(inst => ({
                                watchlistId: newWatchlist.id,
                                instrumentToken: inst.instrumentToken
                            }))
                        );
                    }
                }
            }
        });

        console.log(`[RESET] Account reset successful for user: ${userId}`);

        return NextResponse.json({
            success: true,
            message: "Account reset successfully. Wallet set to ₹1L and default watchlist created.",
            data: {
                balance: 100000
            }
        });

    } catch (error) {
        console.error("[RESET] Failed:", error);
        return handleError(error);
    }
}
