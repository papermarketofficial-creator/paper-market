
import { NextRequest, NextResponse } from "next/server";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { auth } from "@/lib/auth";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Required for EventEmitter and long-running connections

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const encoder = new TextEncoder();

    // Get requested symbols from query params
    const searchParams = req.nextUrl.searchParams;
    const symbols = searchParams.get('symbols')?.split(',') || [];

    console.log('📡 SSE: New connection request for symbols:', symbols);

    // Subscribe to these symbols in Upstox
    if (symbols.length > 0) {
        await realTimeMarketService.initialize();
        await realTimeMarketService.subscribe(symbols);
        console.log('✅ SSE: Subscribed to symbols:', symbols);
    }

    const stream = new ReadableStream({
        start(controller) {
            console.log('📡 SSE: Stream started for client');
            // Send initial connection message
            controller.enqueue(encoder.encode(`data: {"type":"connected"}\n\n`));

            // Listener for market ticks
            const onTick = (quote: any) => {
                // Send all ticks - the frontend will filter if needed
                // The quote.symbol is already the trading symbol (e.g., "RELIANCE")
                console.log('📤 SSE: Sending tick to client:', quote.symbol, quote.price);
                const payload = JSON.stringify({ type: 'tick', data: quote });
                controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            };

            realTimeMarketService.on('tick', onTick);

            // Keep-alive heartbeat
            const heartbeat = setInterval(() => {
                controller.enqueue(encoder.encode(`: keep-alive\n\n`));
            }, 15000);

            // Cleanup on close
            req.signal.addEventListener('abort', () => {
                clearInterval(heartbeat);
                realTimeMarketService.off('tick', onTick);
                controller.close();
            });
        }
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    });
}
