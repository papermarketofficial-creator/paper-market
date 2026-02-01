
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

    // Subscribe to these symbols in Upstox
    if (symbols.length > 0) {
        await realTimeMarketService.initialize();
        await realTimeMarketService.subscribe(symbols);
    }

    const stream = new ReadableStream({
        start(controller) {
            // Send initial connection message
            controller.enqueue(encoder.encode(`data: {"type":"connected"}\n\n`));

            // Listener for market ticks
            const onTick = (quote: any) => {
                // Only send updates for symbols the user is interested in (if filtered)
                // If no filter, send all (or handle efficiently)
                if (symbols.length === 0 || symbols.includes(quote.symbol)) {
                    const payload = JSON.stringify({ type: 'tick', data: quote });
                    controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                }
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
