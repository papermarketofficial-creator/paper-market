import { logger } from "@/lib/logger";
import { tickBus, type NormalizedTick } from "@/lib/trading/tick-bus";
import { marketFeedSupervisor } from "@/lib/trading/market-feed-supervisor";
import { toInstrumentKey } from "@/lib/market/symbol-normalization";

type FeedHealthSnapshot = {
    lastTickTimestamp: number;
    websocketConnected: boolean;
    tickRatePerSecond: number;
    subscribedTokenCount: number;
    staleTokenCount: number;
    healthy: boolean;
};

const FEED_MAX_TICK_AGE_MS = Math.max(1000, Number(process.env.FEED_MAX_TICK_AGE_MS ?? "5000"));
const FEED_MIN_TICK_RATE = Math.max(0, Number(process.env.FEED_MIN_TICK_RATE ?? "2"));
const FEED_MIN_ACTIVE_TOKENS = Math.max(0, Number(process.env.FEED_MIN_ACTIVE_TOKENS ?? "10"));
const EVALUATION_INTERVAL_MS = 1000;

function isExpectedSilenceSession(): boolean {
    return marketFeedSupervisor.getSessionState() === "EXPECTED_SILENCE";
}

export class FeedHealthService {
    private intervalId: NodeJS.Timeout | null = null;
    private tickWindowCount = 0;
    private staleByToken = new Map<string, number>();
    private lastPriceByToken = new Map<string, number>();
    private websocketConnected = false;
    private bootstrapping = true;
    private readonly BOOTSTRAP_TIMEOUT_MS = 10000;
    private bootstrapStartedAt = Date.now();

    private state: FeedHealthSnapshot = {
        lastTickTimestamp: 0,
        websocketConnected: false,
        tickRatePerSecond: 0,
        subscribedTokenCount: 0,
        staleTokenCount: 0,
        healthy: true,
    };

    private readonly onTick = (tick: NormalizedTick): void => {
        const token = toInstrumentKey(String(tick.instrumentKey || ""));
        if (!token) return;

        const price = Number(tick.price);
        if (!Number.isFinite(price) || price <= 0) return;

        const nowMs = Date.now();
        this.tickWindowCount += 1;
        this.state.lastTickTimestamp = nowMs;
        this.staleByToken.set(token, nowMs);
        this.lastPriceByToken.set(token, price);

        if (this.bootstrapping) {
            this.bootstrapping = false;
            logger.info("Feed bootstrap completed - first tick received");
        }
    };

    constructor() {
        tickBus.on("tick", this.onTick);
        this.startEvaluationLoop();
    }

    private startEvaluationLoop(): void {
        if (this.intervalId) return;
        this.intervalId = setInterval(() => {
            this.evaluateHealth();
        }, EVALUATION_INTERVAL_MS);
    }

    setWebsocketConnected(connected: boolean): void {
        this.websocketConnected = Boolean(connected);
        if (connected && this.bootstrapping) {
            this.bootstrapping = false;
            logger.info("Feed bootstrap completed - websocket connected");
        }
    }

    recordPrice(instrumentToken: string, price: number, timestampMs: number = Date.now()): void {
        const token = toInstrumentKey(String(instrumentToken || ""));
        const numericPrice = Number(price);
        if (!token) return;
        if (!Number.isFinite(numericPrice) || numericPrice <= 0) return;

        const ts = Number.isFinite(timestampMs) && timestampMs > 0 ? Number(timestampMs) : Date.now();
        this.staleByToken.set(token, ts);
        this.lastPriceByToken.set(token, numericPrice);
        if (ts > this.state.lastTickTimestamp) {
            this.state.lastTickTimestamp = ts;
        }
    }

    isFeedHealthy(): boolean {
        return this.state.healthy;
    }

    getLastPrice(instrumentToken: string, maxAgeMs: number = FEED_MAX_TICK_AGE_MS): number | null {
        const token = toInstrumentKey(String(instrumentToken || ""));
        if (!token) return null;

        const lastSeen = this.staleByToken.get(token);
        const price = this.lastPriceByToken.get(token);
        if (!lastSeen || !Number.isFinite(price) || (price as number) <= 0) return null;

        const ageMs = Date.now() - lastSeen;
        if (!Number.isFinite(ageMs) || ageMs < -5000 || ageMs > maxAgeMs) return null;
        return Number(price);
    }

    assertFeedHealthy(instrumentToken?: string): void {
        if (isExpectedSilenceSession()) {
            logger.warn(
                { event: "FEED_EXPECTED_SILENCE", instrumentToken: instrumentToken || null },
                "Feed in expected silence session; fallback pricing remains enabled"
            );
            return;
        }

        const now = Date.now();
        if (this.bootstrapping) {
            const elapsed = now - this.bootstrapStartedAt;
            const connected =
                this.websocketConnected ||
                marketFeedSupervisor.getHealthMetrics().isConnected;

            if (connected || elapsed < this.BOOTSTRAP_TIMEOUT_MS) {
                return;
            }
        }

        if (this.state.healthy) return;

        if (instrumentToken) {
            const freshPrice = this.getLastPrice(instrumentToken, FEED_MAX_TICK_AGE_MS);
            if (freshPrice !== null) return;
        }

        logger.warn(
            {
                event: "FEED_UNHEALTHY_FALLBACK_MODE",
                instrumentToken: instrumentToken || null,
                metrics: this.state,
            },
            "Feed unhealthy - switching to fallback pricing"
        );
    }

    private evaluateHealth(): void {
        const nowMs = Date.now();
        const tokens = this.getSubscribedTokens();
        const subscribedTokenCount = tokens.length;
        const tickRatePerSecond = this.tickWindowCount;
        this.tickWindowCount = 0;

        const supervisorConnected = marketFeedSupervisor.getHealthMetrics().isConnected;
        const websocketConnected = this.websocketConnected || supervisorConnected;
        this.websocketConnected = websocketConnected;

        let staleTokenCount = 0;
        for (const token of tokens) {
            const lastTokenTick = this.staleByToken.get(token) || 0;
            const ageMs = nowMs - lastTokenTick;
            if (!lastTokenTick || !Number.isFinite(ageMs) || ageMs > FEED_MAX_TICK_AGE_MS) {
                staleTokenCount += 1;
            }
        }

        const ageMs = this.state.lastTickTimestamp
            ? nowMs - this.state.lastTickTimestamp
            : Number.POSITIVE_INFINITY;
        const unhealthyReasons: string[] = [];

        if (!websocketConnected && !this.bootstrapping) {
            unhealthyReasons.push("WS_DISCONNECTED");
        }

        if (subscribedTokenCount > 0 && ageMs > FEED_MAX_TICK_AGE_MS) {
            unhealthyReasons.push("STALE_GLOBAL_TICK");
        }

        if (
            subscribedTokenCount >= FEED_MIN_ACTIVE_TOKENS &&
            tickRatePerSecond < FEED_MIN_TICK_RATE
        ) {
            unhealthyReasons.push("LOW_TICK_RATE");
        }

        if (subscribedTokenCount > 0 && staleTokenCount >= subscribedTokenCount) {
            unhealthyReasons.push("ALL_SUBSCRIBED_TOKENS_STALE");
        }

        const healthy = unhealthyReasons.length === 0;
        const wasHealthy = this.state.healthy;

        this.state = {
            lastTickTimestamp: this.state.lastTickTimestamp,
            websocketConnected,
            tickRatePerSecond,
            subscribedTokenCount,
            staleTokenCount,
            healthy,
        };

        if (healthy === wasHealthy) return;

        if (!healthy) {
            logger.warn(
                {
                    event: "FEED_UNHEALTHY_DETECTED",
                    reasons: unhealthyReasons,
                    metrics: this.state,
                },
                "Feed unhealthy - switching to fallback pricing"
            );
            return;
        }

        logger.info(
            {
                event: "FEED_RECOVERED",
                metrics: this.state,
            },
            "Feed recovered"
        );
    }

    private getSubscribedTokens(): string[] {
        const activeSymbols = marketFeedSupervisor.getActiveSymbols();
        const tokens = new Set<string>();
        for (const symbol of activeSymbols) {
            const token = toInstrumentKey(String(symbol || ""));
            if (!token) continue;
            tokens.add(token);
        }
        return Array.from(tokens);
    }
}

declare global {
    var __feedHealthServiceInstance: FeedHealthService | undefined;
}

const globalState = globalThis as unknown as {
    __feedHealthServiceInstance?: FeedHealthService;
};

export const feedHealthService =
    globalState.__feedHealthServiceInstance || new FeedHealthService();

globalState.__feedHealthServiceInstance = feedHealthService;

export function isFeedHealthy(): boolean {
    return feedHealthService.isFeedHealthy();
}

export function assertFeedHealthy(instrumentToken?: string): void {
    feedHealthService.assertFeedHealthy(instrumentToken);
}

export function getFeedLastPrice(instrumentToken: string, maxAgeMs?: number): number | null {
    return feedHealthService.getLastPrice(instrumentToken, maxAgeMs);
}

export function recordFeedPrice(instrumentToken: string, price: number, timestampMs?: number): void {
    feedHealthService.recordPrice(instrumentToken, price, timestampMs);
}

export function isMarketSessionClosed(): boolean {
    return isExpectedSilenceSession();
}
