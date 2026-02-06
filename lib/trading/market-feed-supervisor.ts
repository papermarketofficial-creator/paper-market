import { EventEmitter } from 'events';
import { UpstoxWebSocket } from '@/lib/integrations/upstox/websocket';
import { SymbolSupervisor } from './symbol-supervisor';

// ═══════════════════════════════════════════════════════════
// 🔥 CRITICAL FIX #1: TRUE global singleton lock
// ═══════════════════════════════════════════════════════════
declare global {
    var __marketFeedSupervisor: MarketFeedSupervisor | undefined;
}

// ═══════════════════════════════════════════════════════════
// � SESSION STATE: Context-aware feed status
// ═══════════════════════════════════════════════════════════
type SessionState = 
    | 'NORMAL'            // Market hours, expecting ticks
    | 'EXPECTED_SILENCE'  // Market closed, silence is normal
    | 'SUSPECT_OUTAGE';   // Market open but no ticks (real issue)

// ═══════════════════════════════════════════════════════════
// �📡 MARKET FEED SUPERVISOR: Self-healing feed manager
// ═══════════════════════════════════════════════════════════

export class MarketFeedSupervisor extends EventEmitter {
    private ws: UpstoxWebSocket;
    private supervisor: SymbolSupervisor;
    
    // ═══════════════════════════════════════════════════════════
    // 🚨 PHASE 1: Transport-Level Health (NOT heartbeat symbol)
    // ═══════════════════════════════════════════════════════════
    // Track ANY tick, not a specific symbol
    // Heartbeat symbols can pause during market hours (normal)
    // Feed health = transport health, not symbol-specific
    private lastAnyTick = Date.now();
    private tickCount = 0;
    
    // 🔥 CRITICAL: Circuit Breaker (Prevent reconnect storms)
    private reconnectAttempts = 0;
    private reconnectFailures = 0;
    private lastFailureWindow = Date.now();
    private circuitBreakerOpen = false;
    
    // 🔥 CRITICAL: Session state tracking
    private sessionState: SessionState = 'NORMAL';
    
    private healthCheckInterval: NodeJS.Timeout;
    private isConnected = false;
    
    private readonly RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
    private readonly MAX_FAILURES_PER_WINDOW = 5;
    private readonly FAILURE_WINDOW_MS = 120000; // 2 minutes
    private readonly CIRCUIT_BREAKER_COOLDOWN_MS = 60000; // 60s cooldown
    
    constructor() {
        super();
        
        this.ws = UpstoxWebSocket.getInstance();
        this.supervisor = new SymbolSupervisor(this.ws);
        
        // 🔥 ELITE PATTERN: Prewarm feed with core symbols
        // This ensures instant ticks for first user (no cold start delay)
        // Core symbols are always subscribed (high liquidity)
        const coreSymbols = ['RELIANCE', 'NIFTY']; // High liquidity symbols
        console.log(`🔥 Prewarming feed with core symbols:`, coreSymbols);
        coreSymbols.forEach(sym => this.supervisor.add(sym));
        
        // Health monitor (every 15s)
        this.healthCheckInterval = setInterval(() => {
            this.checkHealth();
        }, 15000);
        
        console.log('✅ MarketFeedSupervisor initialized with prewarmed feed');
    }
    
    /**
     * Initialize feed connection
     */
    async initialize() {
        if (this.isConnected) {
            console.log('⚠️ Already connected');
            return;
        }
        
        console.log('🔌 Connecting to market feed...');
        
        await this.ws.connect((data: any) => {
            this.handleTick(data);
        });
        
        this.isConnected = true;
        console.log('✅ Market feed connected');
    }
    
    /**
     * 🔥 CRITICAL: Check if we should EXPECT ticks
     * 
     * Not "is market open" — but "should ticks be flowing?"
     * 
     * This prevents false alarms during:
     * - Market close
     * - Weekends
     * - Holidays
     * - Pre-market silence
     */
    private shouldExpectTicks(): boolean {
        return this.isMarketHours() || this.isPostMarketAuction();
    }
    
    /**
     * Check if within regular market hours (9:15 AM - 3:30 PM IST)
     */
    private isMarketHours(): boolean {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const day = now.getDay();
        
        // Skip weekends
        if (day === 0 || day === 6) {
            return false;
        }
        
        const time = hours * 60 + minutes;
        
        // Market: 9:15 AM - 3:30 PM IST
        const marketOpen = 9 * 60 + 15;   // 555 minutes
        const marketClose = 15 * 60 + 30; // 930 minutes
        
        return time >= marketOpen && time <= marketClose;
    }
    
    /**
     * Check if in post-market auction session (3:30 PM - 4:00 PM IST)
     */
    private isPostMarketAuction(): boolean {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const day = now.getDay();
        
        // Skip weekends
        if (day === 0 || day === 6) {
            return false;
        }
        
        const time = hours * 60 + minutes;
        
        // Post-market: 3:30 PM - 4:00 PM IST
        const auctionStart = 15 * 60 + 30; // 930 minutes
        const auctionEnd = 16 * 60;        // 960 minutes
        
        return time >= auctionStart && time <= auctionEnd;
    }
    
    /**
     * Check feed health
     * 🚨 PHASE 1: Transport-level health check (NOT symbol-specific)
     * 
     * WHY: Heartbeat symbols can pause during market hours (normal).
     * Feed health = transport health, not any single symbol.
     * 
     * Professional systems bias toward patience (60s threshold).
     * False reconnect storms kill infra faster than real outages.
     */
    private checkHealth() {
        const silence = Date.now() - this.lastAnyTick;
        const tickRate = this.tickCount / 15; // tps
        
        // Update session state based on market hours
        if (!this.shouldExpectTicks()) {
            this.sessionState = 'EXPECTED_SILENCE';
            console.log(`� Market closed (${tickRate.toFixed(1)} tps, last tick ${(silence/1000).toFixed(0)}s ago) - Status: IDLE`);
            this.tickCount = 0;
            return; // 🔥 Don't reconnect during expected silence
        }
        
        // During market hours
        this.sessionState = 'NORMAL';
        console.log(`📊 Health: ${tickRate.toFixed(1)} tps, last tick ${(silence/1000).toFixed(0)}s ago`);
        
        // 🚨 PHASE 1: Transport-level silence detection (60s threshold)
        // Only reconnect if feed is COMPLETELY silent (no ticks from ANY symbol)
        // 60 seconds = professional patience threshold
        if (silence > 60000 && this.isConnected) {
            this.sessionState = 'SUSPECT_OUTAGE';
            console.error(`🚨 FEED SILENT ${(silence/1000).toFixed(0)}s — reconnecting`);
            this.reconnect();
        }
        
        this.tickCount = 0; // Reset counter
    }
    
    /**
     * Reconnect with jitter and circuit breaker
     * 🔥 CRITICAL: Circuit breaker prevents reconnect storms
     */
    private async reconnect() {
        const now = Date.now();
        
        // Reset failure counter if outside window
        if (now - this.lastFailureWindow > this.FAILURE_WINDOW_MS) {
            this.reconnectFailures = 0;
            this.lastFailureWindow = now;
            this.circuitBreakerOpen = false;
        }
        
        this.reconnectFailures++;
        
        // 🔥 CIRCUIT BREAKER: Stop reconnecting after threshold
        if (this.reconnectFailures > this.MAX_FAILURES_PER_WINDOW) {
            if (!this.circuitBreakerOpen) {
                console.error(`🚨 CIRCUIT BREAKER OPEN: ${this.reconnectFailures} failures in ${this.FAILURE_WINDOW_MS/1000}s`);
                console.error(`🛑 Cooling down for ${this.CIRCUIT_BREAKER_COOLDOWN_MS/1000}s...`);
                this.circuitBreakerOpen = true;
            }
            
            await new Promise(resolve => setTimeout(resolve, this.CIRCUIT_BREAKER_COOLDOWN_MS));
            
            // Reset after cooldown
            this.reconnectFailures = 0;
            this.lastFailureWindow = Date.now();
            this.circuitBreakerOpen = false;
            console.log('✅ Circuit breaker CLOSED, resuming reconnects');
        }
        
        this.isConnected = false;
        
        // Full state reset (NO ghost subscriptions)
        this.ws.disconnect();
        
        // Jittered exponential backoff
        const base = 1000;
        const delay = base * Math.pow(2, this.reconnectAttempts) + Math.random() * 500;
        this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, this.RECONNECT_DELAYS.length - 1);
        
        console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}, failures: ${this.reconnectFailures})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
            // Reconnect
            await this.initialize();
            
            // 🔥 CRITICAL FIX: Resubscribe ALL active symbols (not just pending!)
            const symbols = this.supervisor.getActiveSymbols();
            if (symbols.length > 0) {
                console.log(`🔔 Resubscribing to ${symbols.length} symbols after reconnect`);
                this.supervisor.flushPending(); // Force immediate flush
            }
            
            this.reconnectAttempts = 0; // Reset on success
            console.log('✅ Reconnect successful');
        } catch (error) {
            console.error('❌ Reconnect failed:', error);
            // Will retry via checkHealth
        }
    }
    
    /**
     * Handle incoming tick
     * 🚨 PHASE 1: Update transport-level health on EVERY tick
     */
    private handleTick(data: any) {
        this.tickCount++;
        
        // ═══════════════════════════════════════════════════════════
        // 🚨 PHASE 1: Update on ANY tick (transport-level health)
        // ═══════════════════════════════════════════════════════════
        this.lastAnyTick = Date.now();
        
        // Emit to SSE clients
        this.emit('tick', data);
    }
    
    /**
     * Extract symbol from tick data
     */
    private extractSymbol(data: any): string {
        // Handle different data formats
        if (data.symbol) return data.symbol;
        if (data.feeds) {
            const keys = Object.keys(data.feeds);
            if (keys.length > 0) {
                // Extract from key like "NSE_EQ|INE002A01018"
                return keys[0].split('|')[1] || keys[0];
            }
        }
        return '';
    }
    
    /**
     * Subscribe to symbols
     */
    subscribe(symbols: string | string[]) {
        const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
        
        symbolArray.forEach(symbol => {
            this.supervisor.add(symbol);
        });
    }
    
    /**
     * Unsubscribe from symbols
     */
    unsubscribe(symbols: string | string[]) {
        const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
        
        symbolArray.forEach(symbol => {
            this.supervisor.remove(symbol);
        });
    }
    
    /**
     * Get active symbols
     */
    getActiveSymbols(): string[] {
        return this.supervisor.getActiveSymbols();
    }
    
    /**
     * Get current session state
     */
    getSessionState(): SessionState {
        return this.sessionState;
    }
    
    /**
     * Get health metrics
     */
    getHealthMetrics() {
        return {
            sessionState: this.sessionState,
            lastAnyTick: this.lastAnyTick,
            timeSinceLastTickMs: Date.now() - this.lastAnyTick,
            isConnected: this.isConnected,
            reconnectFailures: this.reconnectFailures,
            circuitBreakerOpen: this.circuitBreakerOpen,
            activeSymbols: this.supervisor.getActiveSymbols().length,
        };
    }
    
    /**
     * Cleanup
     */
    destroy() {
        clearInterval(this.healthCheckInterval);
        this.ws.disconnect();
        this.removeAllListeners();
        console.log('🗑️ MarketFeedSupervisor destroyed');
    }
}

// ═══════════════════════════════════════════════════════════
// 🔥 CRITICAL: Global singleton export
// ═══════════════════════════════════════════════════════════
export const marketFeedSupervisor =
    global.__marketFeedSupervisor ??
    (global.__marketFeedSupervisor = new MarketFeedSupervisor());
