import { EventEmitter } from "events";
import { UpstoxWebSocket } from "@/lib/integrations/upstox/websocket";
import { SymbolSupervisor } from "./symbol-supervisor";

type SessionState = "NORMAL" | "EXPECTED_SILENCE" | "SUSPECT_OUTAGE";

export class MarketFeedSupervisor extends EventEmitter {
  private ws: UpstoxWebSocket;
  private supervisor: SymbolSupervisor;

  private lastAnyTick = Date.now();
  private tickCount = 0;

  private reconnectAttempts = 0;
  private reconnectFailures = 0;
  private lastFailureWindow = Date.now();
  private circuitBreakerOpen = false;

  private sessionState: SessionState = "NORMAL";
  private healthCheckInterval: NodeJS.Timeout;
  private isConnected = false;
  private reconnectInProgress = false;

  private readonly RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
  private readonly MAX_FAILURES_PER_WINDOW = 5;
  private readonly FAILURE_WINDOW_MS = 120000;
  private readonly CIRCUIT_BREAKER_COOLDOWN_MS = 60000;

  constructor() {
    super();
    this.ws = UpstoxWebSocket.getInstance();
    this.supervisor = new SymbolSupervisor(this.ws);

    this.healthCheckInterval = setInterval(() => {
      this.checkHealth();
    }, 15000);

    console.log("MarketFeedSupervisor initialized");
  }

  private syncConnectionState() {
    this.isConnected = this.ws.isSocketConnected();
  }

  async initialize() {
    this.syncConnectionState();
    if (this.isConnected) {
      console.log("Market feed already connected");
      return;
    }

    console.log("Connecting to market feed...");
    await this.ws.connect((data: any) => {
      this.handleTick(data);
    });

    this.syncConnectionState();
    if (this.isConnected) {
      console.log("Market feed connected");
    } else {
      console.log("Market feed connect initiated (awaiting open event)");
    }
  }

  private shouldExpectTicks(): boolean {
    return this.isMarketHours() || this.isPostMarketAuction();
  }

  private getIstClock(now: Date = new Date()): { day: number; hour: number; minute: number } {
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: false,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);

    const weekday = parts.find((p) => p.type === "weekday")?.value || "";
    const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");

    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return {
      day: dayMap[weekday] ?? 0,
      hour,
      minute,
    };
  }

  private isMarketHours(): boolean {
    const { day, hour, minute } = this.getIstClock();
    if (day === 0 || day === 6) return false;

    const time = hour * 60 + minute;
    const marketOpen = 9 * 60 + 15;
    const marketClose = 15 * 60 + 30;
    return time >= marketOpen && time <= marketClose;
  }

  private isPostMarketAuction(): boolean {
    const { day, hour, minute } = this.getIstClock();
    if (day === 0 || day === 6) return false;

    const time = hour * 60 + minute;
    const auctionStart = 15 * 60 + 30;
    const auctionEnd = 16 * 60;
    return time >= auctionStart && time <= auctionEnd;
  }

  private checkHealth() {
    this.syncConnectionState();

    const silenceMs = Date.now() - this.lastAnyTick;
    const tickRate = this.tickCount / 15;
    const activeSymbolsCount = this.supervisor.getActiveSymbols().length;
    const authCooldownRemainingMs = this.ws.getAuthCooldownRemainingMs();

    if (!this.shouldExpectTicks()) {
      this.sessionState = "EXPECTED_SILENCE";
      console.log(
        `Market closed (${tickRate.toFixed(1)} tps, last tick ${(silenceMs / 1000).toFixed(0)}s ago) - status: IDLE`
      );
      this.tickCount = 0;
      return;
    }

    if (activeSymbolsCount === 0) {
      this.sessionState = "NORMAL";
      this.tickCount = 0;
      return;
    }

    this.sessionState = "NORMAL";
    console.log(`Health: ${tickRate.toFixed(1)} tps, last tick ${(silenceMs / 1000).toFixed(0)}s ago`);

    if (authCooldownRemainingMs > 0) {
      console.warn(
        `Auth cooldown active (${Math.ceil(authCooldownRemainingMs / 1000)}s), skipping reconnect`
      );
      this.tickCount = 0;
      return;
    }

    if (silenceMs > 60000 && !this.reconnectInProgress) {
      this.sessionState = "SUSPECT_OUTAGE";
      console.error(`Feed silent ${(silenceMs / 1000).toFixed(0)}s - reconnecting`);
      void this.reconnect();
    }

    this.tickCount = 0;
  }

  private async reconnect() {
    if (this.reconnectInProgress) return;
    this.reconnectInProgress = true;

    try {
      const now = Date.now();
      if (now - this.lastFailureWindow > this.FAILURE_WINDOW_MS) {
        this.reconnectFailures = 0;
        this.lastFailureWindow = now;
        this.circuitBreakerOpen = false;
      }

      this.reconnectFailures++;

      if (this.reconnectFailures > this.MAX_FAILURES_PER_WINDOW) {
        if (!this.circuitBreakerOpen) {
          console.error(
            `Circuit breaker open: ${this.reconnectFailures} failures in ${this.FAILURE_WINDOW_MS / 1000}s`
          );
          console.error(`Cooling down for ${this.CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s...`);
          this.circuitBreakerOpen = true;
        }

        await new Promise((resolve) => setTimeout(resolve, this.CIRCUIT_BREAKER_COOLDOWN_MS));

        this.reconnectFailures = 0;
        this.lastFailureWindow = Date.now();
        this.circuitBreakerOpen = false;
        console.log("Circuit breaker closed, resuming reconnects");
      }

      const authCooldownRemainingMs = this.ws.getAuthCooldownRemainingMs();
      if (authCooldownRemainingMs > 0) {
        console.warn(`Delaying reconnect for auth cooldown (${Math.ceil(authCooldownRemainingMs / 1000)}s)`);
        await new Promise((resolve) => setTimeout(resolve, authCooldownRemainingMs));
      }

      this.syncConnectionState();
      if (this.isConnected) {
        this.ws.disconnect();
        this.isConnected = false;
      }

      const delay = this.RECONNECT_DELAYS[Math.min(this.reconnectAttempts, this.RECONNECT_DELAYS.length - 1)] ?? 30000;
      this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, this.RECONNECT_DELAYS.length - 1);

      console.log(
        `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}, failures: ${this.reconnectFailures})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));

      await this.initialize();

      const symbols = this.supervisor.getActiveSymbols();
      if (symbols.length > 0) {
        console.log(`Resubscribing to ${symbols.length} symbols after reconnect`);
        this.supervisor.flushPending();
      }

      this.reconnectAttempts = 0;
      console.log("Reconnect successful");
    } catch (error) {
      console.error("Reconnect failed:", error);
    } finally {
      this.reconnectInProgress = false;
      this.syncConnectionState();
    }
  }

  private handleTick(data: any) {
    this.tickCount++;
    this.lastAnyTick = Date.now();
    this.emit("tick", data);
  }

  subscribe(symbols: string | string[]) {
    const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
    symbolArray.forEach((symbol) => {
      this.supervisor.add(symbol);
    });
  }

  unsubscribe(symbols: string | string[]) {
    const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
    symbolArray.forEach((symbol) => {
      this.supervisor.remove(symbol);
    });
  }

  getActiveSymbols(): string[] {
    return this.supervisor.getActiveSymbols();
  }

  getSessionState(): SessionState {
    return this.sessionState;
  }

  getHealthMetrics() {
    this.syncConnectionState();
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

  destroy() {
    clearInterval(this.healthCheckInterval);
    this.ws.disconnect();
    this.removeAllListeners();
    console.log("MarketFeedSupervisor destroyed");
  }
}

export const marketFeedSupervisor = new MarketFeedSupervisor();
