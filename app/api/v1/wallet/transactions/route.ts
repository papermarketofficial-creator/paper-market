import { NextResponse } from "next/server";
import { WalletService } from "@/services/wallet.service";
import { handleError } from "@/lib/errors";
import { auth } from "@/lib/auth";
import { TransactionQuerySchema } from "@/lib/validation/wallet";

/**
 * GET /api/v1/wallet/transactions
 * Get user's transaction history with optional filters
 * 
 * Query Parameters:
 * - type: CREDIT | DEBIT | BLOCK | UNBLOCK | SETTLEMENT
 * - referenceType: ORDER | TRADE | POSITION
 * - startDate: ISO datetime string
 * - endDate: ISO datetime string
 * - limit: number (default 20, max 100)
 * - page: number (default 1)
 */
export async function GET(req: Request) {
    try {
        // 1. Authenticate user
        const session = await auth();
        if (!session?.user?.id) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const userId = session.user.id;

        // 2. Parse and validate query parameters
        const { searchParams } = new URL(req.url);

        const queryData = {
            userId,
            type: searchParams.get("type") || undefined,
            referenceType: searchParams.get("referenceType") || undefined,
            startDate: searchParams.get("startDate") || undefined,
            endDate: searchParams.get("endDate") || undefined,
            limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 20,
            page: searchParams.get("page") ? parseInt(searchParams.get("page")!) : 1,
        };

        const validatedQuery = TransactionQuerySchema.parse(queryData);

        // 3. Call service
        const filters = {
            type: validatedQuery.type as any,
            referenceType: validatedQuery.referenceType,
            startDate: validatedQuery.startDate ? new Date(validatedQuery.startDate) : undefined,
            endDate: validatedQuery.endDate ? new Date(validatedQuery.endDate) : undefined,
            limit: validatedQuery.limit,
            page: validatedQuery.page,
        };

        const result = await WalletService.getTransactions(userId, filters);

        // 4. Return standard response with pagination
        return NextResponse.json({
            success: true,
            data: {
                transactions: result.transactions,
                pagination: {
                    page: validatedQuery.page,
                    limit: validatedQuery.limit,
                    total: result.total,
                },
            },
        });

    } catch (error) {
        return handleError(error);
    }
}
