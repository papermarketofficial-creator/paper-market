import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { realTimeMarketService } from "@/services/realtime-market.service";

export const dynamic = 'force-dynamic';

/**
 * 🔥 INSTITUTIONAL PATTERN: Server-side symbol subscriptions
 * 
 * SSE stream is symbol-agnostic (permanent connection).
 * Subscriptions happen server-side when charts/watchlists load.
 * 
 * This prevents:
 * - SSE reconnect storms
 * - Tick drops during symbol changes
 * - Ghost subscriptions
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const body = await req.json();
        const { symbols } = body;

        if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
            return NextResponse.json(
                { success: false, error: "symbols array required" },
                { status: 400 }
            );
        }

        // Initialize if not already
        await realTimeMarketService.initialize();

        // Subscribe to symbols via supervisor (ref-counted)
        await realTimeMarketService.subscribe(symbols);

        console.log(`✅ Subscribed to ${symbols.length} symbols:`, symbols);

        return NextResponse.json({
            success: true,
            data: { subscribedCount: symbols.length, symbols }
        });

    } catch (error: any) {
        console.error("Subscribe API Error:", error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const body = await req.json();
        const { symbols } = body;

        if (!symbols || !Array.isArray(symbols)) {
            return NextResponse.json(
                { success: false, error: "symbols array required" },
                { status: 400 }
            );
        }

        // Unsubscribe via supervisor (ref-counted)
        await realTimeMarketService.unsubscribe(symbols);

        console.log(`🗑️ Unsubscribed from ${symbols.length} symbols:`, symbols);

        return NextResponse.json({
            success: true,
            data: { unsubscribedCount: symbols.length }
        });

    } catch (error: any) {
        console.error("Unsubscribe API Error:", error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
