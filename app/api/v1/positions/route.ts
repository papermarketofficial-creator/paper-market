import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PositionService } from "@/services/position.service";
import { handleError, ApiError } from "@/lib/errors";

/**
 * Get positions for the authenticated user.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        const positions = await PositionService.getPositions(session.user.id);

        return NextResponse.json({
            success: true,
            data: positions,
        });
    } catch (error) {
        return handleError(error);
    }
}
