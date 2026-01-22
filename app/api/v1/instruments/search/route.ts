import { NextRequest, NextResponse } from "next/server";
import { InstrumentService } from "@/services/instrument.service";
import { handleError } from "@/lib/errors";
import { InstrumentSearchSchema } from "@/lib/validation/instruments";

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const query = searchParams.get("q") || "";

        // Validate input
        const validated = InstrumentSearchSchema.parse({ q: query });

        // Call service
        const results = await InstrumentService.search(validated.q);

        return NextResponse.json({
            success: true,
            data: results,
        });
    } catch (error) {
        return handleError(error);
    }
}
