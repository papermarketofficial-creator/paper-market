
import { NextRequest, NextResponse } from "next/server";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { auth } from "@/lib/auth";
import { tickBus } from "@/lib/trading/tick-bus";

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

            // Listener for market ticks from unified TickBus
            const onTick = (tick: any) => {
                // TickBus emits NormalizedTick { symbol, price, timestamp (seconds), volume, exchange, close }
                // Convert to format expected by frontend
                const quote = {
                    symbol: tick.symbol,
                    price: tick.price,
                    timestamp: tick.timestamp * 1000, // Convert seconds to milliseconds
                    volume: tick.volume,
                    close: tick.close
                };
                
                // Log every 20th tick to avoid console spam
                if (Math.random() < 0.05) {
                    console.log('📤 SSE: Streaming tick:', tick.symbol, '@', tick.price);
                }
                
                const payload = JSON.stringify({ type: 'tick', data: quote });
                controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            };

            // Subscribe to unified TickBus (receives ticks from all sources)
            tickBus.on('tick', onTick);

            // Keep-alive heartbeat
            const heartbeat = setInterval(() => {
                controller.enqueue(encoder.encode(`: keep-alive\n\n`));
            }, 15000);

            // Cleanup on close
            req.signal.addEventListener('abort', () => {
                clearInterval(heartbeat);
                tickBus.off('tick', onTick);
                controller.close();
                console.log('🔴 SSE: Client disconnected, cleaned up TickBus subscription');
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
