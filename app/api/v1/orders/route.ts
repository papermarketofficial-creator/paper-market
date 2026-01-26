import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { OrderService } from "@/services/order.service";
import { handleError, ApiError } from "@/lib/errors";
import { PlaceOrderSchema, OrderQuerySchema } from "@/lib/validation/oms";

/**
 * Place a new order.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        const body = await req.json();
        const validated = PlaceOrderSchema.parse(body);

        const order = await OrderService.placeOrder(session.user.id, validated);

        return NextResponse.json({
            success: true,
            data: order,
        }, { status: 201 });
    } catch (error) {
        return handleError(error);
    }
}

/**
 * Get orders for the authenticated user.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        const searchParams = req.nextUrl.searchParams;
        const filters = OrderQuerySchema.parse({
            status: searchParams.get("status") || undefined,
            symbol: searchParams.get("symbol") || undefined,
            limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined,
            page: searchParams.get("page") ? parseInt(searchParams.get("page")!) : undefined,
        });

        const orders = await OrderService.getOrders(session.user.id, filters);

        return NextResponse.json({
            success: true,
            data: orders,
        });
    } catch (error) {
        return handleError(error);
    }
}
