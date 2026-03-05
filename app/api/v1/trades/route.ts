import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TradeService } from "@/services/trade.service";
import { handleError, ApiError } from "@/lib/errors";

/**
 * Get trades for the authenticated user.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        const searchParams = req.nextUrl.searchParams;
        const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;
        const page = searchParams.get("page") ? parseInt(searchParams.get("page")!) : undefined;

        // Fetch all trades (Service doesn't support db-level pagination yet)
        const allTrades = await TradeService.getUserTrades(session.user.id);

        let trades = allTrades;
        if (limit && page) {
            const start = (page - 1) * limit;
            trades = allTrades.slice(start, start + limit);
        }

        return NextResponse.json({
            success: true,
            data: trades,
        });
    } catch (error) {
        return handleError(error);
    }
}
