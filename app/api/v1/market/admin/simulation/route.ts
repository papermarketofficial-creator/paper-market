import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { marketTickJob } from "@/jobs/market-tick.job";
import { handleError, ApiError } from "@/lib/errors";

/**
 * Start the market simulation.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        await marketTickJob.start();

        return NextResponse.json({
            success: true,
            data: {
                message: "Market simulation started",
                status: marketTickJob.getStatus(),
            },
        });
    } catch (error) {
        return handleError(error);
    }
}

/**
 * Stop the market simulation.
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        marketTickJob.stop();

        return NextResponse.json({
            success: true,
            data: {
                message: "Market simulation stopped",
            },
        });
    } catch (error) {
        return handleError(error);
    }
}

/**
 * Get simulation status.
 */
export async function GET(req: NextRequest) {
    try {
        const status = marketTickJob.getStatus();

        return NextResponse.json({
            success: true,
            data: status,
        });
    } catch (error) {
        return handleError(error);
    }
}
