import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { marketFeedSupervisor } from '@/lib/trading/market-feed-supervisor';
import { tickBus } from '@/lib/trading/tick-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 📊 FEED HEALTH OBSERVABILITY DASHBOARD
 * 
 * Returns real-time feed health metrics for monitoring
 * 
 * Metrics:
 * - Active symbols and ref counts
 * - Reconnect statistics
 * - Heartbeat age
 * - Tick rate (tps)
 * - Memory usage
 * - Event loop lag
 */
export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get active symbols from supervisor
    const activeSymbols = marketFeedSupervisor.getActiveSymbols();
    
    // Get health metrics
    const healthMetrics = marketFeedSupervisor.getHealthMetrics();
    
    // Get tick stats from TickBus
    const tickStats = tickBus.getStats();
    
    // Event loop lag measurement
    const start = Date.now();
    await new Promise(resolve => setImmediate(resolve));
    const eventLoopLag = Date.now() - start;
    
    // Memory usage
    const memUsage = process.memoryUsage();
    
    const health = {
        status: healthMetrics.sessionState === 'NORMAL' ? 'healthy' : 
                healthMetrics.sessionState === 'EXPECTED_SILENCE' ? 'idle' : 'degraded',
        timestamp: new Date().toISOString(),
        
        session: {
            state: healthMetrics.sessionState,
            isConnected: healthMetrics.isConnected,
            timeSinceLastTickMs: healthMetrics.timeSinceLastTickMs,
            circuitBreakerOpen: healthMetrics.circuitBreakerOpen,
            reconnectFailures: healthMetrics.reconnectFailures,
        },
        
        feed: {
            activeSymbols: activeSymbols.length,
            symbols: activeSymbols,
            totalTicks: tickStats.totalTicks,
            symbolCounts: tickStats.symbolCounts,
            activeListeners: tickStats.activeListeners,
        },
        
        performance: {
            eventLoopLagMs: eventLoopLag,
            memoryMB: {
                rss: Math.round(memUsage.rss / 1024 / 1024),
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            },
        },
        
        uptime: {
            processUptimeSeconds: Math.floor(process.uptime()),
        },
    };

    return NextResponse.json(health);
}
