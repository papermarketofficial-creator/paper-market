import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PositionService } from "@/services/position.service";
import { handleError, ApiError } from "@/lib/errors";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        const positions = await PositionService.getUserPositionsWithPnL(session.user.id);

        return NextResponse.json({
            success: true,
            data: positions,
        });

    } catch (error) {
        return handleError(error);
    }
}
