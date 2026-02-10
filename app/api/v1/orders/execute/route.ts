import { NextRequest, NextResponse } from "next/server";
import { ExecutionService } from "@/services/execution.service";
import { handleError } from "@/lib/errors";

/**
 * Manually trigger execution of all OPEN orders.
 * Useful for testing or recovering from execution failures.
 */
export async function POST(req: NextRequest) {
    try {
        const executedCount = await ExecutionService.executeOpenOrders();
        
        return NextResponse.json({
            success: true,
            data: {
                executedCount,
                message: `Executed ${executedCount} orders`
            }
        });
    } catch (error) {
        return handleError(error);
    }
}
