
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

    console.log('📡 SSE: New connection request (symbol-agnostic stream)');

    // 🔥 CRITICAL INSTITUTIONAL RULE: SSE NEVER depends on symbols
    // Stream is permanent. Symbols are dynamic in supervisor.
    // Subscriptions happen server-side via:
    // - watchlist loader
    // - chart loader  
    // - positions loader
    await realTimeMarketService.initialize();

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

            // 🔥 CRITICAL: Send heartbeat for tab sleep detection
            const heartbeat = setInterval(() => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`));
            }, 10000); // Every 10s

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
