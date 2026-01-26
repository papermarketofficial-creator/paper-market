import { NextResponse } from "next/server";
import { WalletService } from "@/services/wallet.service";
import { handleError } from "@/lib/errors";
import { auth } from "@/lib/auth";

/**
 * POST /api/v1/admin/wallet/recalculate/[userId]
 * Recalculate wallet balance from transaction ledger (admin recovery tool)
 * 
 * ADMIN ONLY - Use when wallet cache is suspected to be inconsistent
 */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ userId: string }> }
) {
    const { userId } = await params;
    try {
        // 1. Authenticate admin user
        const session = await auth();
        if (!session?.user?.id) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        // TODO: Add admin role check
        // if (session.user.role !== "ADMIN") {
        //     return new NextResponse("Forbidden - Admin access required", { status: 403 });
        // }

        const targetUserId = userId;

        // 2. Call service to recalculate
        await WalletService.recalculateFromLedger(targetUserId);

        // 3. Get updated wallet
        const wallet = await WalletService.getWallet(targetUserId);

        // 4. Return result
        return NextResponse.json({
            success: true,
            data: {
                userId: targetUserId,
                balance: parseFloat(wallet.balance),
                blockedBalance: parseFloat(wallet.blockedBalance),
                lastReconciled: wallet.lastReconciled,
                message: "Wallet recalculated successfully from ledger",
            },
        });

    } catch (error) {
        return handleError(error);
    }
}
