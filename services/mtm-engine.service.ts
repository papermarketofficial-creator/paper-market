import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { instruments, positions, wallets } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { toInstrumentKey } from "@/lib/market/symbol-normalization";
import { marketFeedSupervisor } from "@/lib/trading/market-feed-supervisor";
import { tickBus, type NormalizedTick } from "@/lib/trading/tick-bus";
import { marginCurveService } from "@/services/margin-curve.service";
import { liquidationEngineService } from "@/services/liquidation-engine.service";

type MarginStatus = "NORMAL" | "MARGIN_STRESSED";
type AccountState = "NORMAL" | "MARGIN_STRESSED" | "LIQUIDATING";

type PositionCache = {
    userId: string;
    instrumentToken: string;
    quantity: number;
    averagePrice: number;
    realizedPnL: number;
    instrumentType: string;
};

type WalletState = {
    walletId: string;
    balance: number;
    equity: number;
    unrealizedPnL: number;
    realizedPnL: number;
    requiredMargin: number;
    maintenanceMargin: number;
    marginStatus: MarginStatus;
    accountState: AccountState;
    lastComputedAt: number | null;
};

type TickPrice = {
    price: number;
    timestampMs: number;
};

export type MtmRiskPosition = {
    instrumentToken: string;
    quantity: number;
    averagePrice: number;
    instrumentType: string;
    markPrice: number;
    notional: number;
};

export type MtmSnapshot = {
    balance: number;
    equity: number;
    unrealizedPnL: number;
    realizedPnL: number;
    requiredMargin: number;
    maintenanceMargin: number;
    marginStatus: MarginStatus;
    accountState: AccountState;
    lastComputedAt: number | null;
};

const MTM_STALE_TICK_MAX_AGE_MS =
    Number(process.env.MTM_STALE_TICK_MAX_AGE_SECONDS ?? "10") * 1000;
const MTM_FLUSH_INTERVAL_MS = Number(process.env.MTM_FLUSH_INTERVAL_MS ?? "3000");
const MTM_POSITION_REFRESH_INTERVAL_MS = Number(process.env.MTM_POSITION_REFRESH_INTERVAL_MS ?? "5000");

const EPSILON = 0.005;

function toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function normalizeAccountState(value: unknown): AccountState {
    const raw = String(value || "").toUpperCase();
    if (raw === "LIQUIDATING") return "LIQUIDATING";
    if (raw === "MARGIN_STRESSED") return "MARGIN_STRESSED";
    return "NORMAL";
}

function computeRequiredMargin(position: PositionCache, markPrice: number): number {
    const qty = Math.abs(position.quantity);
    const notional = qty * markPrice;
    const instrumentType = position.instrumentType;

    if (instrumentType === "FUTURE") return notional * 0.15;
    if (instrumentType === "OPTION") {
        return position.quantity >= 0 ? notional : notional * 1.2;
    }
    return notional;
}

export class MtmEngineService {
    private initialized = false;
    private initializePromise: Promise<void> | null = null;
    private refreshing = false;
    private refreshRequested = false;
    private flushing = false;

    private flushTimer: NodeJS.Timeout | null = null;
    private refreshTimer: NodeJS.Timeout | null = null;

    private positionsByUser = new Map<string, PositionCache[]>();
    private tokenToUsers = new Map<string, Set<string>>();
    private latestPriceByToken = new Map<string, TickPrice>();
    private walletsByUser = new Map<string, WalletState>();
    private dirtyUsers = new Set<string>();
    private subscribedTokens = new Set<string>();

    private readonly onTick = (tick: NormalizedTick): void => {
        if (!this.initialized) return;

        const instrumentToken = toInstrumentKey(String(tick.instrumentKey || ""));
        if (!instrumentToken) return;

        const price = Number(tick.price);
        if (!Number.isFinite(price) || price <= 0) return;

        const tickTimestampMs = Number(tick.timestamp) * 1000;
        const nowMs = Date.now();
        if (!Number.isFinite(tickTimestampMs)) return;

        const ageMs = nowMs - tickTimestampMs;
        if (ageMs > MTM_STALE_TICK_MAX_AGE_MS || ageMs < -5000) {
            return;
        }

        this.latestPriceByToken.set(instrumentToken, {
            price,
            timestampMs: tickTimestampMs,
        });

        const affectedUsers = this.tokenToUsers.get(instrumentToken);
        if (!affectedUsers || affectedUsers.size === 0) return;

        for (const userId of affectedUsers) {
            this.revalueUser(userId, nowMs);
        }
    };

    async initialize(): Promise<void> {
        if (this.initialized) return;
        if (this.initializePromise) {
            await this.initializePromise;
            return;
        }

        this.initializePromise = (async () => {
            await this.refreshOpenState("init");

            tickBus.on("tick", this.onTick);
            if (!this.flushTimer) {
                this.flushTimer = setInterval(() => {
                    void this.flushSnapshots();
                }, MTM_FLUSH_INTERVAL_MS);
            }
            if (!this.refreshTimer) {
                this.refreshTimer = setInterval(() => {
                    void this.refreshOpenState("interval");
                }, MTM_POSITION_REFRESH_INTERVAL_MS);
            }

            this.initialized = true;
            logger.info("MTM engine initialized");
        })();

        try {
            await this.initializePromise;
        } finally {
            this.initializePromise = null;
        }
    }

    async shutdown(): Promise<void> {
        if (!this.initialized) return;

        tickBus.off("tick", this.onTick);
        if (this.flushTimer) clearInterval(this.flushTimer);
        if (this.refreshTimer) clearInterval(this.refreshTimer);

        this.flushTimer = null;
        this.refreshTimer = null;
        this.initialized = false;
    }

    requestRefresh(): void {
        if (!this.initialized) return;
        this.refreshRequested = true;
        if (!this.refreshing) {
            void this.refreshOpenState("manual");
        }
    }

    async forceRefreshOpenState(): Promise<void> {
        await this.refreshOpenState("manual");
    }

    async forceFlush(): Promise<void> {
        await this.flushSnapshots();
    }

    getUserSnapshot(userId: string): MtmSnapshot | null {
        const state = this.walletsByUser.get(userId);
        if (!state) return null;
        return {
            balance: state.balance,
            equity: state.equity,
            unrealizedPnL: state.unrealizedPnL,
            realizedPnL: state.realizedPnL,
            requiredMargin: state.requiredMargin,
            maintenanceMargin: state.maintenanceMargin,
            marginStatus: state.marginStatus,
            accountState: state.accountState,
            lastComputedAt: state.lastComputedAt,
        };
    }

    getLatestPrice(instrumentToken: string, maxAgeMs: number = MTM_STALE_TICK_MAX_AGE_MS): number | null {
        const state = this.latestPriceByToken.get(instrumentToken);
        if (!state) return null;

        const nowMs = Date.now();
        const ageMs = nowMs - state.timestampMs;
        if (!Number.isFinite(ageMs) || ageMs < -5000 || ageMs > maxAgeMs) {
            return null;
        }

        return state.price;
    }

    getUserRiskPositions(userId: string): MtmRiskPosition[] {
        const positions = this.positionsByUser.get(userId) || [];
        const nowMs = Date.now();

        return positions
            .filter((position) => Number.isFinite(position.quantity) && position.quantity !== 0)
            .map((position) => {
                const latest = this.latestPriceByToken.get(position.instrumentToken);
                const latestAge = latest ? nowMs - latest.timestampMs : Number.POSITIVE_INFINITY;
                const markPrice =
                    latest &&
                    Number.isFinite(latest.price) &&
                    latest.price > 0 &&
                    Number.isFinite(latestAge) &&
                    latestAge >= -5000 &&
                    latestAge <= MTM_STALE_TICK_MAX_AGE_MS
                        ? latest.price
                        : position.averagePrice;

                return {
                    instrumentToken: position.instrumentToken,
                    quantity: position.quantity,
                    averagePrice: position.averagePrice,
                    instrumentType: position.instrumentType || "EQUITY",
                    markPrice,
                    notional: Math.abs(position.quantity) * Math.max(0.01, markPrice),
                };
            });
    }

    private async refreshOpenState(reason: "init" | "interval" | "manual"): Promise<void> {
        if (this.refreshing) {
            this.refreshRequested = true;
            return;
        }

        this.refreshing = true;
        this.refreshRequested = false;

        try {
            const previousUsers = new Set(this.walletsByUser.keys());

            const rows = await db
                .select({
                    userId: positions.userId,
                    instrumentToken: positions.instrumentToken,
                    quantity: positions.quantity,
                    averagePrice: positions.averagePrice,
                    realizedPnL: positions.realizedPnL,
                    instrumentType: instruments.instrumentType,
                })
                .from(positions)
                .leftJoin(instruments, eq(positions.instrumentToken, instruments.instrumentToken));

            const nextPositionsByUser = new Map<string, PositionCache[]>();
            const nextTokenToUsers = new Map<string, Set<string>>();
            const nextTokens = new Set<string>();

            for (const row of rows) {
                const instrumentToken = toInstrumentKey(String(row.instrumentToken || ""));
                const quantity = Number(row.quantity);
                if (!instrumentToken || !Number.isFinite(quantity) || quantity === 0) continue;

                const entry: PositionCache = {
                    userId: row.userId,
                    instrumentToken,
                    quantity,
                    averagePrice: toNumber(row.averagePrice),
                    realizedPnL: toNumber(row.realizedPnL),
                    instrumentType: String(row.instrumentType || "EQUITY"),
                };

                if (!nextPositionsByUser.has(row.userId)) {
                    nextPositionsByUser.set(row.userId, []);
                }
                nextPositionsByUser.get(row.userId)!.push(entry);

                if (!nextTokenToUsers.has(instrumentToken)) {
                    nextTokenToUsers.set(instrumentToken, new Set<string>());
                }
                nextTokenToUsers.get(instrumentToken)!.add(row.userId);
                nextTokens.add(instrumentToken);
            }

            const allUsers = new Set<string>([
                ...Array.from(nextPositionsByUser.keys()),
                ...Array.from(previousUsers),
            ]);
            const userIds = Array.from(allUsers);
            const walletRows = userIds.length
                ? await db
                    .select({
                        id: wallets.id,
                        userId: wallets.userId,
                        balance: wallets.balance,
                        equity: wallets.equity,
                        marginStatus: wallets.marginStatus,
                        accountState: wallets.accountState,
                    })
                    .from(wallets)
                    .where(inArray(wallets.userId, userIds))
                : [];

            const walletByUser = new Map(walletRows.map((row) => [row.userId, row]));
            const nextWalletsByUser = new Map<string, WalletState>();

            for (const userId of userIds) {
                const wallet = walletByUser.get(userId);
                const previous = this.walletsByUser.get(userId);

                const balance = wallet ? toNumber(wallet.balance) : previous?.balance ?? 0;
                const equity = wallet ? toNumber(wallet.equity) : previous?.equity ?? balance;
                const marginStatus = wallet?.marginStatus === "MARGIN_STRESSED" ? "MARGIN_STRESSED" : "NORMAL";
                const accountState = normalizeAccountState(wallet?.accountState || previous?.accountState || "NORMAL");

                nextWalletsByUser.set(userId, {
                    walletId: wallet?.id || previous?.walletId || "",
                    balance,
                    equity,
                    unrealizedPnL: previous?.unrealizedPnL ?? 0,
                    realizedPnL: previous?.realizedPnL ?? 0,
                    requiredMargin: previous?.requiredMargin ?? 0,
                    maintenanceMargin: previous?.maintenanceMargin ?? 0,
                    marginStatus,
                    accountState,
                    lastComputedAt: previous?.lastComputedAt ?? null,
                });
            }

            const unsubscribeTokens = Array.from(this.subscribedTokens).filter((token) => !nextTokens.has(token));
            if (unsubscribeTokens.length > 0) {
                marketFeedSupervisor.unsubscribe(unsubscribeTokens);
            }

            const subscribeTokens = Array.from(nextTokens).filter((token) => !this.subscribedTokens.has(token));
            if (subscribeTokens.length > 0) {
                marketFeedSupervisor.subscribe(subscribeTokens);
            }

            this.positionsByUser = nextPositionsByUser;
            this.tokenToUsers = nextTokenToUsers;
            this.walletsByUser = nextWalletsByUser;
            this.subscribedTokens = nextTokens;

            const nowMs = Date.now();
            for (const userId of userIds) {
                this.revalueUser(userId, nowMs);
            }

            logger.debug(
                {
                    reason,
                    users: userIds.length,
                    positions: rows.length,
                    tokens: nextTokens.size,
                },
                "MTM open state refreshed"
            );
        } catch (error) {
            logger.error({ err: error }, "MTM refresh failed");
        } finally {
            this.refreshing = false;
            if (this.refreshRequested) {
                this.refreshRequested = false;
                void this.refreshOpenState("interval");
            }
        }
    }

    private revalueUser(userId: string, nowMs: number): void {
        const walletState = this.walletsByUser.get(userId);
        if (!walletState) return;

        const userPositions = this.positionsByUser.get(userId) || [];
        if (userPositions.length === 0) {
            const nextEquity = round2(walletState.balance);
            const nextStatus: MarginStatus = "NORMAL";
            const nextAccountState: AccountState = "NORMAL";
            const changed =
                Math.abs(walletState.equity - nextEquity) > EPSILON ||
                walletState.marginStatus !== nextStatus ||
                walletState.accountState !== nextAccountState ||
                Math.abs(walletState.unrealizedPnL) > EPSILON ||
                Math.abs(walletState.realizedPnL) > EPSILON ||
                Math.abs(walletState.requiredMargin) > EPSILON ||
                Math.abs(walletState.maintenanceMargin) > EPSILON;

            if (changed) {
                walletState.equity = nextEquity;
                walletState.unrealizedPnL = 0;
                walletState.realizedPnL = 0;
                walletState.requiredMargin = 0;
                walletState.maintenanceMargin = 0;
                walletState.marginStatus = nextStatus;
                walletState.accountState = nextAccountState;
                walletState.lastComputedAt = nowMs;
                this.dirtyUsers.add(userId);
            }
            this.triggerLiquidationCheck(userId, walletState);
            return;
        }

        let unrealizedPnL = 0;
        let realizedPnL = 0;
        let requiredMargin = 0;

        for (const position of userPositions) {
            const priceState = this.latestPriceByToken.get(position.instrumentToken);
            if (!priceState) {
                return;
            }

            const ageMs = nowMs - priceState.timestampMs;
            if (ageMs > MTM_STALE_TICK_MAX_AGE_MS || ageMs < -5000) {
                return;
            }

            const qty = position.quantity;
            const avg = position.averagePrice;
            const price = priceState.price;

            if (qty >= 0) {
                unrealizedPnL += (price - avg) * qty;
            } else {
                unrealizedPnL += (avg - price) * Math.abs(qty);
            }

            realizedPnL += position.realizedPnL;
            requiredMargin += computeRequiredMargin(position, price);
        }

        const nextEquity = round2(walletState.balance + realizedPnL + unrealizedPnL);
        const nextMaintenanceMargin = marginCurveService.getMaintenanceMargin(requiredMargin);
        const nextStatus: MarginStatus = nextEquity < requiredMargin ? "MARGIN_STRESSED" : "NORMAL";
        const nextAccountState: AccountState = nextStatus === "MARGIN_STRESSED" ? "MARGIN_STRESSED" : "NORMAL";

        const changed =
            Math.abs(walletState.equity - nextEquity) > EPSILON ||
            Math.abs(walletState.unrealizedPnL - unrealizedPnL) > EPSILON ||
            Math.abs(walletState.realizedPnL - realizedPnL) > EPSILON ||
            Math.abs(walletState.requiredMargin - requiredMargin) > EPSILON ||
            Math.abs(walletState.maintenanceMargin - nextMaintenanceMargin) > EPSILON ||
            walletState.marginStatus !== nextStatus ||
            walletState.accountState !== nextAccountState;

        if (!changed) return;

        walletState.equity = nextEquity;
        walletState.unrealizedPnL = round2(unrealizedPnL);
        walletState.realizedPnL = round2(realizedPnL);
        walletState.requiredMargin = round2(requiredMargin);
        walletState.maintenanceMargin = nextMaintenanceMargin;
        walletState.marginStatus = nextStatus;
        walletState.accountState = nextAccountState;
        walletState.lastComputedAt = nowMs;
        this.dirtyUsers.add(userId);
        this.triggerLiquidationCheck(userId, walletState);
    }

    private triggerLiquidationCheck(userId: string, walletState: WalletState): void {
        void liquidationEngineService
            .evaluateFromMtm(userId, {
                equity: walletState.equity,
                requiredMargin: walletState.requiredMargin,
                maintenanceMargin: walletState.maintenanceMargin,
                accountState: walletState.accountState,
            })
            .catch((error) => {
                logger.error({ err: error, userId }, "Liquidation check failed");
            });
    }

    private async flushSnapshots(): Promise<void> {
        if (!this.initialized || this.flushing || this.dirtyUsers.size === 0) return;
        this.flushing = true;

        const users = Array.from(this.dirtyUsers);
        try {
            await Promise.all(
                users.map(async (userId) => {
                    const state = this.walletsByUser.get(userId);
                    if (!state || !state.walletId) return;

                    await db
                        .update(wallets)
                        .set({
                            equity: state.equity.toFixed(2),
                            marginStatus: state.marginStatus,
                            updatedAt: new Date(),
                        })
                        .where(eq(wallets.userId, userId));
                })
            );

            for (const userId of users) {
                this.dirtyUsers.delete(userId);
            }
        } catch (error) {
            logger.error({ err: error }, "MTM snapshot flush failed");
        } finally {
            this.flushing = false;
        }
    }
}

declare global {
    var __mtmEngineServiceInstance: MtmEngineService | undefined;
}

const globalState = globalThis as unknown as { __mtmEngineServiceInstance?: MtmEngineService };
export const mtmEngineService = globalState.__mtmEngineServiceInstance || new MtmEngineService();

// Always cache globally to prevent duplicate instances in production
globalState.__mtmEngineServiceInstance = mtmEngineService;
