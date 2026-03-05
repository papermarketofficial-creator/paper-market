import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { OrderService } from "@/services/order.service";
import { handleError, ApiError } from "@/lib/errors";
import { CancelOrderSchema } from "@/lib/validation/oms";

/**
 * Cancel an order.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    const { orderId } = await params;
    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        const validated = CancelOrderSchema.parse({ orderId: orderId });

        const order = await OrderService.cancelOrder(session.user.id, validated.orderId);

        return NextResponse.json({
            success: true,
            data: order,
        });
    } catch (error) {
        return handleError(error);
    }
}
