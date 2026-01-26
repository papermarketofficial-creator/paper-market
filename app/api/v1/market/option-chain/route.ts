import { NextRequest, NextResponse } from "next/server";
import { OptionChainSchema } from "@/lib/validation/option-chain";
import { OptionChainService } from "@/services/option-chain.service";
import { handleError } from "@/lib/errors";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

        const input = OptionChainSchema.parse({
            symbol: searchParams.get("symbol") || "",
            expiry: searchParams.get("expiry") || undefined,
        });

        const data = await OptionChainService.getOptionChain(input);

        return NextResponse.json({
            success: true,
            data: data,
        });

    } catch (error) {
        return handleError(error);
    }
}
