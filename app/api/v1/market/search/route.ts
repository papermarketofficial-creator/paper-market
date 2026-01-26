import { NextRequest, NextResponse } from "next/server";
import { InstrumentSearchSchema } from "@/lib/validation/search";
import { SearchService } from "@/services/search.service";
import { handleError } from "@/lib/errors";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

        // Parse query params using Zod
        const input = InstrumentSearchSchema.parse({
            q: searchParams.get("q") || "",
            type: searchParams.get("type") || undefined,
            limit: searchParams.get("limit") || 10,
        });

        const results = await SearchService.searchInstruments(input);

        return NextResponse.json({
            success: true,
            data: results,
        });

    } catch (error) {
        return handleError(error);
    }
}
