import { NextRequest, NextResponse } from "next/server";
import { marketSimulation } from "@/services/market-simulation.service";
import { handleError, ApiError } from "@/lib/errors";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ symbol: string }> }
) {
    try {
        const { symbol } = await params;
        const quote = marketSimulation.getQuote(symbol);

        if (!quote) {
            throw new ApiError("Quote not found", 404, "NOT_FOUND");
        }

        return NextResponse.json({
            success: true,
            data: quote,
        });
    } catch (error) {
        return handleError(error);
    }
}
