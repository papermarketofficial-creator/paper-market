import { NextResponse } from "next/server";
import { WalletService } from "@/services/wallet.service";
import { handleError } from "@/lib/errors";
import { auth } from "@/lib/auth";

/**
 * GET /api/v1/wallet
 * Get user's wallet balance and status
 * 
 * Following backend-dev SKILL.md:
 * - Controller is "dumb" traffic cop
 * - No business logic in route handler
 * - Call service layer for all operations
 */
export async function GET(req: Request) {
    try {
        // 1. Authenticate user
        const session = await auth();
        if (!session?.user?.id) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const userId = session.user.id;

        // 2. Call service
        const wallet = await WalletService.getWallet(userId);

        // 3. Calculate available balance
        const balance = parseFloat(wallet.balance);
        const equity = parseFloat(wallet.equity);
        const blockedBalance = parseFloat(wallet.blockedBalance);
        const availableBalance = balance - blockedBalance;

        // 4. Return standard response
        return NextResponse.json({
            success: true,
            data: {
                balance: balance,
                equity: equity,
                blockedBalance: blockedBalance,
                availableBalance: availableBalance,
                marginStatus: wallet.marginStatus,
                accountState: wallet.accountState,
                currency: wallet.currency,
                lastReconciled: wallet.lastReconciled,
                updatedAt: wallet.updatedAt,
            },
        });

    } catch (error) {
        return handleError(error);
    }
}
