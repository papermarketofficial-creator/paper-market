import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PositionService } from "@/services/position.service";
import { handleError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Close a position (full or partial)
 * POST /api/v1/positions/{positionId}/close
 */
export async function POST(
    req: NextRequest,
    props: { params: Promise<{ positionId: string }> }
) {
    const params = await props.params;
    const { positionId } = params;
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: { message: "Unauthorized" } },
                { status: 401 }
            );
        }

        const { positionId } = params;
        const body = await req.json();
        const { quantity } = body; // Optional: for partial close

        logger.info({ userId: session.user.id, positionId, quantity }, "Closing position");

        // Close position via service
        const result = await PositionService.closePosition(
            session.user.id,
            positionId,
            quantity
        );

        return NextResponse.json({
            success: true,
            data: result,
            message: quantity 
                ? `Partially closed ${quantity} units` 
                : "Position closed successfully"
        });
    } catch (error) {
        return handleError(error);
    }
}
