import { NextRequest, NextResponse } from "next/server";
import { instrumentRepository } from "@/lib/instruments/repository";
import { handleError } from "@/lib/errors";
import { InstrumentSearchSchema } from "@/lib/validation/instruments";

// Force dynamic since we access query params (though Next.js handles this)
export const dynamic = 'force-dynamic';

function normalizeUnderlying(input: string): string {
    const raw = String(input || "").trim().toUpperCase();
    if (!raw) return "";

    const alias: Record<string, string> = {
        NIFTY50: "NIFTY",
        "NIFTY 50": "NIFTY",
        NIFTYBANK: "BANKNIFTY",
        "NIFTY BANK": "BANKNIFTY",
        NIFTYFINSERVICE: "FINNIFTY",
        "NIFTY FIN SERVICE": "FINNIFTY",
        MIDCAP: "MIDCPNIFTY",
        MIDCPNIFTY: "MIDCPNIFTY",
    };

    const compact = raw.replace(/\s+/g, "");
    return alias[raw] || alias[compact] || raw;
}

function toMode(raw: string | null): "ALL" | "EQUITY" | "FUTURE" | "OPTION" {
    const mode = String(raw || "").trim().toUpperCase();
    if (mode === "FUTURES" || mode === "FUTURE") return "FUTURE";
    if (mode === "OPTIONS" || mode === "OPTION") return "OPTION";
    if (mode === "EQUITY" || mode === "CASH") return "EQUITY";
    return "ALL";
}

function isModeMatch(instrument: any, mode: "ALL" | "EQUITY" | "FUTURE" | "OPTION"): boolean {
    if (mode === "ALL") return true;
    if (mode === "EQUITY") {
        return instrument.instrumentType === "EQUITY" && instrument.segment === "NSE_EQ";
    }
    if (mode === "FUTURE") {
        const type = String(instrument.instrumentType || "").toUpperCase();
        return instrument.segment === "NSE_FO" && type === "FUTURE";
    }
    const type = String(instrument.instrumentType || "").toUpperCase();
    return instrument.segment === "NSE_FO" && type === "OPTION";
}

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const query = searchParams.get("q") || "";
        const mode = toMode(searchParams.get("mode"));
        const underlying = normalizeUnderlying(searchParams.get("underlying") || "");

        // Validate input
        const validated = InstrumentSearchSchema.parse({ q: query });

        // Derivatives need a wider candidate pool because option chains can flood
        // prefix matches and hide futures contracts (e.g., RELIANCE).
        const candidateLimit = mode === "FUTURE" || mode === "OPTION" ? 800 : 200;

        // Call In-Memory Repository (Fast lookup)
        const rawResults = await instrumentRepository.search(validated.q, candidateLimit);
        const filtered = rawResults.filter((inst) => {
            if (!isModeMatch(inst, mode)) return false;
            if (!underlying) return true;
            return normalizeUnderlying(inst.name) === underlying;
        });
        const results = filtered.slice(0, 20);

        return NextResponse.json({
            success: true,
            data: results,
            meta: {
                count: results.length,
                source: 'memory'
            }
        });
    } catch (error) {
        return handleError(error);
    }
}
