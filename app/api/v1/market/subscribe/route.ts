import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = 'force-dynamic';

/**
 * Subscribe/Unsubscribe routes are deprecated.
 * 
 * Symbol subscriptions are now handled client-side via WebSocket
 * connection to market-engine. These routes are kept for backward
 * compatibility but should not be used.
 * 
 * To subscribe to symbols:
 * 1. Client connects to market-engine WebSocket (ws://localhost:4201)
 * 2. Client sends: { type: 'subscribe', symbols: ['RELIANCE', 'TCS'] }
 * 3. Market-engine handles ref-counted subscriptions to Upstox
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

        // This route is deprecated - subscriptions happen client-side via WebSocket
        console.warn(`⚠️ Deprecated subscribe route called for ${symbols.length} symbols. Use WebSocket instead.`);

        return NextResponse.json({
            success: true,
            message: "Subscriptions are now handled client-side via WebSocket. This route is deprecated.",
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

        // This route is deprecated - unsubscriptions happen client-side via WebSocket
        console.warn(`⚠️ Deprecated unsubscribe route called for ${symbols.length} symbols. Use WebSocket instead.`);

        return NextResponse.json({
            success: true,
            message: "Unsubscriptions are now handled client-side via WebSocket. This route is deprecated.",
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
