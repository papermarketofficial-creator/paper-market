import { NextRequest, NextResponse } from "next/server";
import { marketSimulation } from "@/services/market-simulation.service";
import { handleError } from "@/lib/errors";

export async function GET(req: NextRequest) {
    try {
        const quotes = marketSimulation.getAllQuotes();

        return NextResponse.json({
            success: true,
            data: {
                quotes,
                count: Object.keys(quotes).length,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        return handleError(error);
    }
}
