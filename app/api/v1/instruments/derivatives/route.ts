import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { instrumentRepository } from "@/lib/instruments/repository";
import { handleError, ApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

type DerivativeMode = "FUTURE" | "OPTION";

function parseMode(raw: string | null): DerivativeMode {
    const upper = String(raw || "").trim().toUpperCase();
    if (upper === "OPTION") return "OPTION";
    return "FUTURE";
}

function mapToStockShape(inst: any) {
    const strike = Number(inst.strike ?? 0);
    const hasStrike = Number.isFinite(strike) && strike > 0;
    const optionType = inst.instrumentType === "OPTION"
        ? inst.tradingsymbol.endsWith("CE")
            ? "CE"
            : inst.tradingsymbol.endsWith("PE")
                ? "PE"
                : undefined
        : undefined;

    return {
        symbol: inst.tradingsymbol,
        name: inst.name,
        price: 0,
        change: 0,
        changePercent: 0,
        volume: 0,
        lotSize: inst.lotSize,
        instrumentToken: inst.instrumentToken,
        expiryDate: inst.expiry || undefined,
        strikePrice: hasStrike ? strike : undefined,
        optionType,
    };
}

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        }

        const searchParams = req.nextUrl.searchParams;
        const underlying = String(searchParams.get("underlying") || "").trim();
        const mode = parseMode(searchParams.get("instrumentType"));

        if (!underlying) {
            throw new ApiError("underlying is required", 400, "BAD_REQUEST");
        }

        await instrumentRepository.ensureInitialized();

        const source = mode === "OPTION"
            ? instrumentRepository.getOptionsByUnderlying(underlying)
            : instrumentRepository.getFuturesByUnderlying(underlying);

        const instruments = source.map(mapToStockShape);
        const expiries = Array.from(
            new Set(
                source
                    .filter((inst) => inst.expiry)
                    .map((inst) => inst.expiry!.toISOString())
            )
        ).sort();

        return NextResponse.json({
            success: true,
            data: {
                underlying: underlying.toUpperCase(),
                instrumentType: mode,
                count: instruments.length,
                expiries,
                instruments,
            },
        });
    } catch (error) {
        return handleError(error);
    }
}

