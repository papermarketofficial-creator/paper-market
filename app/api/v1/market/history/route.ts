import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth"; // Correct V5 import
import { CandleOrchestrator } from "@/lib/market/candle-orchestrator";

// ═══════════════════════════════════════════════════════════
// 📉 MARKET HISTORY ROUTE (THIN PROXY)
// ═══════════════════════════════════════════════════════════
// Responsibilities:
// 1. Auth Check
// 2. Parse Query Params
// 3. Delegate to Domain Orchestrator
// 4. Return JSON
// 
// ❌ NO BUSINESS LOGIC ALLOWED HERE based on Senior Architect Review.
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const symbol = searchParams.get("symbol");
        const instrumentKeyParam = searchParams.get("instrumentKey");
        const timeframe = searchParams.get("timeframe") || undefined;
        const range = searchParams.get("range") || undefined;
        const toDate = searchParams.get("toDate") || undefined;

        // 1. Resolve Identity
        // Orchestrator needs an Instrument Key.
        // We can optionally use UpstoxService to resolve it here IF we want Orchestrator to be key-agnostic,
        // BUT the Orchestrator plan says "resolve full candle request params". 
        // However, looking at Orchestrator signature `fetchCandles(params: CandleFetchParams)`, it expects `instrumentKey`.
        // So we should verify we have one.
        
        // If we only have symbol, we need to resolve it.
        // Senior plan said: "Delegate to Service".
        // Orchestrator could handle resolution, or we handle it here.
        // Let's check Orchestrator again... it imports UpstoxService.
        // But `fetchCandles` takes `instrumentKey`.
        // So we should resolve key here or let FE pass it.
        // FE usually passes symbol.
        // So let's use UpstoxService.resolveInstrumentKey here OR update Orchestrator to accept symbol.
        
        // BETTER ARCHITECTURE:
        // The Route should resolve the "Input Contract" to "Domain Contract".
        // Input: Symbol OR Key.
        // Domain: Key.
        
        let instrumentKey: string;
        if (instrumentKeyParam) {
            instrumentKey = instrumentKeyParam;
        } else if (symbol) {
            // Resolve symbol to key
            const { UpstoxService } = await import("@/services/upstox.service");
            instrumentKey = await UpstoxService.resolveInstrumentKey(symbol);
        } else {
            return NextResponse.json({ success: false, error: "Missing symbol or instrumentKey" }, { status: 400 });
        }

        // 2. Delegate to Orchestrator
        const result = await CandleOrchestrator.fetchCandles({
            instrumentKey,
            timeframe,
            range,
            toDate
        });

        return NextResponse.json({ 
            success: true, 
            data: result 
        });

    } catch (error: any) {
        if (process.env.DEBUG_MARKET === 'true') {
            console.error("Historical API Error:", error.message);
        }
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

