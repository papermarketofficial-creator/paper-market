
import { NextRequest, NextResponse } from "next/server";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { auth } from "@/lib/auth";
import { tickBus } from "@/lib/trading/tick-bus";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { instruments, positions, watchlistItems, watchlists } from "@/lib/db/schema";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Required for EventEmitter and long-running connections
export const maxDuration = 300;

const SSE_HEARTBEAT_INTERVAL_MS = 20000;
const FLUSH_INTERVAL_MS = 25;
const DEBUG_SSE = process.env.DEBUG_SSE === 'true';
const INDEX_SYMBOLS = ["NIFTY 50", "NIFTY BANK", "NIFTY FIN SERVICE"] as const;

async function resolveBootstrapSymbols(userId: string, req: NextRequest): Promise<string[]> {
    const symbolSet = new Set<string>(INDEX_SYMBOLS);

    // Optional explicit symbol bootstrap via query string:
    // /api/v1/market/stream?symbols=RELIANCE,TCS
    const requested = req.nextUrl.searchParams.get("symbols");
    if (requested) {
        requested
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((s) => symbolSet.add(s));
    }

    const [watchlistRows, positionRows] = await Promise.all([
        db
            .select({
                symbol: instruments.tradingsymbol,
                instrumentKey: instruments.instrumentToken,
            })
            .from(watchlists)
            .innerJoin(watchlistItems, eq(watchlists.id, watchlistItems.watchlistId))
            .innerJoin(instruments, eq(watchlistItems.instrumentToken, instruments.instrumentToken))
            .where(eq(watchlists.userId, userId)),
        db
            .select({
                symbol: positions.symbol,
                instrumentKey: instruments.instrumentToken,
            })
            .from(positions)
            .leftJoin(instruments, eq(positions.symbol, instruments.tradingsymbol))
            .where(eq(positions.userId, userId)),
    ]);

    for (const row of watchlistRows) {
        if (row.symbol) symbolSet.add(row.symbol);
        if (row.instrumentKey) symbolSet.add(row.instrumentKey);
    }

    for (const row of positionRows) {
        if (row.symbol) symbolSet.add(row.symbol);
        if (row.instrumentKey) symbolSet.add(row.instrumentKey);
    }

    return Array.from(symbolSet);
}

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const encoder = new TextEncoder();

    if (DEBUG_SSE) {
        console.log('📡 SSE: New connection request (symbol-agnostic stream)');
    }

    // 🔥 CRITICAL INSTITUTIONAL RULE: SSE NEVER depends on symbols
    // Stream is permanent. Symbols are dynamic in supervisor.
    // Subscriptions happen server-side via:
    // - watchlist loader
    // - chart loader  
    // - positions loader
    await realTimeMarketService.initialize();
    const bootstrapSymbols = await resolveBootstrapSymbols(session.user.id, req);
    if (bootstrapSymbols.length > 0) {
        await realTimeMarketService.subscribe(bootstrapSymbols);
        if (DEBUG_SSE) {
            console.log(`📡 SSE: Bootstrapped ${bootstrapSymbols.length} symbols in stream invocation`);
        }
    }

    const stream = new ReadableStream({
        start(controller) {
            // ═══════════════════════════════════════════════════════════
            // 🚨 PHASE 0: SSE Connection Counter (Baseline Visibility)
            // ═══════════════════════════════════════════════════════════
            const globalAny = globalThis as any;
            globalAny.__SSE_COUNT = (globalAny.__SSE_COUNT || 0) + 1;
            if (DEBUG_SSE) {
                console.log("ACTIVE SSE:", globalAny.__SSE_COUNT);
            }
            
            if (DEBUG_SSE) {
                console.log('📡 SSE: Stream started for client');
            }

            let closed = false;
            const latestTickPayloads = new Map<string, string>();
            let flushTimer: NodeJS.Timeout | null = null;

            const send = (payload: string) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(payload));
                } catch {
                    closed = true;
                }
            };

            const flushLatestTicks = () => {
                flushTimer = null;
                if (closed || latestTickPayloads.size === 0) return;

                const payloads = Array.from(latestTickPayloads.values());
                latestTickPayloads.clear();

                for (const payload of payloads) {
                    send(`data: ${payload}\n\n`);
                    if (closed) break;
                }
            };

            // Send initial connection and client retry hint
            send("retry: 3000\n");
            send(`data: {"type":"connected"}\n\n`);

            // Listener for market ticks from unified TickBus
            const onTick = (tick: any) => {
                // TickBus emits NormalizedTick { instrumentKey, symbol, price, timestamp (seconds), volume, exchange, close }
                // Convert to format expected by frontend
                const quote = {
                    instrumentKey: tick.instrumentKey,
                    symbol: tick.symbol,
                    price: tick.price,
                    timestamp: tick.timestamp * 1000, // Convert seconds to milliseconds
                    volume: tick.volume,
                    close: tick.close
                };

                // Coalesce bursts to latest-per-instrument so one hot symbol does not starve others.
                const instrumentKey = typeof quote.instrumentKey === "string" && quote.instrumentKey.length > 0
                    ? quote.instrumentKey
                    : "__unknown__";
                latestTickPayloads.set(instrumentKey, JSON.stringify({ type: 'tick', data: quote }));

                if (!flushTimer) {
                    flushTimer = setTimeout(flushLatestTicks, FLUSH_INTERVAL_MS);
                }
            };

            // Subscribe to unified TickBus (receives ticks from all sources)
            tickBus.on('tick', onTick);

            // 🔥 CRITICAL: Send heartbeat for tab sleep detection
            const heartbeat = setInterval(() => {
                send(`data: {"type":"heartbeat"}\n\n`);
            }, SSE_HEARTBEAT_INTERVAL_MS);

            // Cleanup on close
            req.signal.addEventListener('abort', () => {
                // ═══════════════════════════════════════════════════════════
                // 🚨 PHASE 0: Decrement SSE counter on disconnect
                // ═══════════════════════════════════════════════════════════
                const globalAny = globalThis as any;
                globalAny.__SSE_COUNT = (globalAny.__SSE_COUNT || 0) - 1;
                closed = true;

                clearInterval(heartbeat);
                if (flushTimer) {
                    clearTimeout(flushTimer);
                }
                latestTickPayloads.clear();
                tickBus.off('tick', onTick);
                if (bootstrapSymbols.length > 0) {
                    void realTimeMarketService
                        .unsubscribe(bootstrapSymbols)
                        .catch((error) => console.error("SSE unsubscribe cleanup failed:", error));
                }
                controller.close();
                if (DEBUG_SSE) {
                    console.log('🔴 SSE: Client disconnected, cleaned up TickBus subscription');
                }
            });
        }
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
