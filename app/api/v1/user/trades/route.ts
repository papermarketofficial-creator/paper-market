import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TradeService } from "@/services/trade.service";
import { handleError, ApiError } from "@/lib/errors";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        const trades = await TradeService.getUserTrades(session.user.id);

        return NextResponse.json({
            success: true,
            data: trades,
        });

    } catch (error) {
        return handleError(error);
    }
}
