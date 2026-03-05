import { NextRequest, NextResponse } from "next/server";
import { InstrumentService } from "@/services/instrument.service";
import { handleError } from "@/lib/errors";
import { InstrumentLookupSchema } from "@/lib/validation/instruments";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ symbol: string }> }
) {
    try {
        const { symbol } = await params;
        // Validate input
        const validated = InstrumentLookupSchema.parse({
            tradingsymbol: symbol,
        });

        // Call service
        const instrument = await InstrumentService.getBySymbol(validated.tradingsymbol);

        return NextResponse.json({
            success: true,
            data: instrument,
        });
    } catch (error) {
        return handleError(error);
    }
}
