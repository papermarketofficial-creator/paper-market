import { NextRequest, NextResponse } from "next/server";
import { InstrumentService } from "@/services/instrument.service";
import { handleError } from "@/lib/errors";
import { InstrumentFilterSchema } from "@/lib/validation/instruments";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Validate input
        const validated = InstrumentFilterSchema.parse(body);

        // Extract pagination params (not part of filter schema)
        const page = typeof body.page === "number" ? body.page : undefined;
        const limit = typeof body.limit === "number" ? body.limit : undefined;

        // Call service
        const results = await InstrumentService.filter({
            ...validated,
            page,
            limit,
        });

        return NextResponse.json({
            success: true,
            data: results,
        });
    } catch (error) {
        return handleError(error);
    }
}
