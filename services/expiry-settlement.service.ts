import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { instruments, positions, type Instrument } from "@/lib/db/schema";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { InstrumentRepository } from "@/lib/instruments/repository";
import { mtmEngineService } from "@/services/mtm-engine.service";
import { liquidationEngineService } from "@/services/liquidation-engine.service";
import { OrderService } from "@/services/order.service";
import { WalletService } from "@/services/wallet.service";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { UpstoxService } from "@/services/upstox.service";
import { isTradingEnabled } from "@/lib/system-control";

type OptionType = "CE" | "PE";
type PriceSource = "REALTIME" | "MTM" | "PREV_CLOSE" | "SYNTHETIC";
type SettlementWindowStatus = "SKIPPED_WINDOW" | "NO_EXPIRIES" | "SETTLED";

type SettlementPositionRow = {
    id: string;
    userId: string;
    symbol: string;
    instrumentToken: string;
    quantity: number;
};

type SettlementPosition = SettlementPositionRow & {
    instrument: Instrument;
    settlementDateKey: string;
    settlementPrice: number;
    intrinsicValue?: number;
    optionType?: OptionType;
};

type PriceResolution = {
    price: number;
    source: PriceSource;
};

const IST_TIME_ZONE = "Asia/Kolkata";
const SETTLEMENT_WINDOW_START_MINUTES = 15 * 60 + 30;
const STALE_TICK_MS = Number(process.env.SETTLEMENT_STALE_TICK_MAX_AGE_SECONDS ?? "10") * 1000;
const SETTLEMENT_SYNTHETIC_PRICE = Math.max(1, Number(process.env.SETTLEMENT_SYNTHETIC_PRICE ?? "100"));
const EPSILON = 0.000001;

function toIstParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: IST_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(date);

    return {
        year: Number(parts.find((part) => part.type === "year")?.value || 0),
        month: Number(parts.find((part) => part.type === "month")?.value || 0),
        day: Number(parts.find((part) => part.type === "day")?.value || 0),
        hour: Number(parts.find((part) => part.type === "hour")?.value || 0),
        minute: Number(parts.find((part) => part.type === "minute")?.value || 0),
    };
}

function toIstDateKey(date: Date): string {
    const p = toIstParts(date);
    return `${p.year.toString().padStart(4, "0")}-${p.month.toString().padStart(2, "0")}-${p.day.toString().padStart(2, "0")}`;
}

function toIstDayNumber(date: Date): number {
    const p = toIstParts(date);
    return Date.UTC(p.year, p.month - 1, p.day);
}

function isTickFresh(lastUpdated: Date | undefined, nowMs: number): boolean {
    if (!(lastUpdated instanceof Date)) return false;
    const updatedMs = lastUpdated.getTime();
    const ageMs = nowMs - updatedMs;
    return Number.isFinite(ageMs) && ageMs >= -5000 && ageMs <= STALE_TICK_MS;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

export class ExpirySettlementService {
    private currentCycleUsers: Set<string> | null = null;
    private closePriceCache = new Map<string, number>();
    private underlyingTokenCache = new Map<string, string>();

    async runSettlementCycle(
        now: Date = new Date(),
        options: { force?: boolean } = {}
    ): Promise<{ status: SettlementWindowStatus; instruments: number; positions: number }> {
        const force = Boolean(options.force);
        if (!force && !isTradingEnabled()) {
            return { status: "SKIPPED_WINDOW", instruments: 0, positions: 0 };
        }

        if (!this.isSettlementWindow(now)) {
            return { status: "SKIPPED_WINDOW", instruments: 0, positions: 0 };
        }

        const repo = InstrumentRepository.getInstance();
        await repo.ensureInitialized();

        const openDerivativeRows = await db
            .select({
                instrumentToken: positions.instrumentToken,
                instrumentType: instruments.instrumentType,
                expiry: instruments.expiry,
            })
            .from(positions)
            .innerJoin(instruments, eq(positions.instrumentToken, instruments.instrumentToken))
            .where(
                and(
                    sql`${positions.quantity} <> 0`,
                    inArray(instruments.instrumentType, ["FUTURE", "OPTION"]),
                    isNotNull(instruments.expiry)
                )
            );

        const dueTokens = Array.from(new Set(
            openDerivativeRows
                .filter((row) => {
                    if (!row.expiry) return false;
                    return toIstDayNumber(new Date(row.expiry)) <= toIstDayNumber(now);
                })
                .map((row) => row.instrumentToken)
        ));

        if (dueTokens.length === 0) {
            return { status: "NO_EXPIRIES", instruments: 0, positions: 0 };
        }

        logger.warn(
            {
                event: "EXPIRY_SETTLEMENT_STARTED",
                settlementDate: toIstDateKey(now),
                instruments: dueTokens.length,
            },
            "EXPIRY_SETTLEMENT_STARTED"
        );

        let settledPositions = 0;
        this.currentCycleUsers = new Set<string>();
        this.closePriceCache.clear();

        try {
            for (const instrumentToken of dueTokens) {
                settledPositions += await this.settleInstrument(instrumentToken, { force });
            }

            if (this.currentCycleUsers.size > 0) {
                await this.refreshRiskAndWalletState(Array.from(this.currentCycleUsers), force);
            }
        } finally {
            this.currentCycleUsers = null;
        }

        return {
            status: "SETTLED",
            instruments: dueTokens.length,
            positions: settledPositions,
        };
    }

    async settleInstrument(
        instrumentToken: string,
        options: { force?: boolean } = {}
    ): Promise<number> {
        const force = Boolean(options.force);
        if (!force && !isTradingEnabled()) return 0;

        const now = new Date();
        const repo = InstrumentRepository.getInstance();
        await repo.ensureInitialized();

        const instrument = await this.getInstrumentByToken(instrumentToken, repo);
        if (!instrument) return 0;
        if (!instrument.expiry) return 0;
        if (!["FUTURE", "OPTION"].includes(instrument.instrumentType)) return 0;
        if (toIstDayNumber(new Date(instrument.expiry)) > toIstDayNumber(now)) return 0;

        const openPositions = await db
            .select({
                id: positions.id,
                userId: positions.userId,
                symbol: positions.symbol,
                instrumentToken: positions.instrumentToken,
                quantity: positions.quantity,
            })
            .from(positions)
            .where(
                and(
                    eq(positions.instrumentToken, instrumentToken),
                    sql`${positions.quantity} <> 0`
                )
            );

        if (openPositions.length === 0) return 0;

        const settlementDateKey = toIstDateKey(now);
        let settledCount = 0;

        if (instrument.instrumentType === "FUTURE") {
            const settlement = await this.resolveDeterministicPrice(instrumentToken, now);
            for (const row of openPositions) {
                const settled = await this.settleUserPosition({
                    ...row,
                    instrument,
                    settlementDateKey,
                    settlementPrice: settlement.price,
                }, { force });
                if (settled) settledCount++;
            }
            return settledCount;
        }

        const optionTypeRaw = String(instrument.optionType || "").toUpperCase();
        const optionType = optionTypeRaw === "CE" || optionTypeRaw === "PE"
            ? (optionTypeRaw as OptionType)
            : null;
        const strike = Number(instrument.strike);
        if (!optionType || !Number.isFinite(strike)) {
            throw new ApiError("Invalid option contract metadata for expiry settlement", 500, "SETTLEMENT_METADATA_INVALID");
        }

        const underlyingToken = await this.resolveUnderlyingToken(instrument);
        const underlying = await this.resolveDeterministicPrice(underlyingToken, now);
        const intrinsicRaw =
            optionType === "CE"
                ? Math.max(underlying.price - strike, 0)
                : Math.max(strike - underlying.price, 0);
        const intrinsic = round2(Math.max(0, intrinsicRaw));
        // Cash-settled option expiry: ITM settles to intrinsic, OTM settles to zero.
        const settlementPrice = intrinsic;

        for (const row of openPositions) {
            const settled = await this.settleUserPosition({
                ...row,
                instrument,
                settlementDateKey,
                settlementPrice,
                intrinsicValue: intrinsic,
                optionType,
            }, { force });
            if (settled) settledCount++;
        }

        return settledCount;
    }

    async settleUserPosition(
        position: SettlementPosition,
        options: { force?: boolean } = {}
    ): Promise<boolean> {
        const closeQuantity = Math.abs(Number(position.quantity));
        if (!Number.isFinite(closeQuantity) || closeQuantity <= 0) return false;

        const closeSide: "BUY" | "SELL" = position.quantity > 0 ? "SELL" : "BUY";
        const idempotencyKey = `SETTLEMENT-${position.instrumentToken}-${position.settlementDateKey}`;

        try {
            await OrderService.placeOrder(position.userId, {
                symbol: position.symbol,
                instrumentToken: position.instrumentToken,
                side: closeSide,
                quantity: closeQuantity,
                orderType: "MARKET",
                idempotencyKey,
                exitReason: "EXPIRY",
                settlementPrice: position.settlementPrice,
            }, { force: options.force });
        } catch (error) {
            if (error instanceof ApiError && error.code === "DUPLICATE_ORDER") {
                return false;
            }
            throw error;
        }

        if (this.currentCycleUsers) {
            this.currentCycleUsers.add(position.userId);
        }

        logger.warn(
            {
                event: "POSITION_SETTLED",
                userId: position.userId,
                instrumentToken: position.instrumentToken,
                quantity: closeQuantity,
                side: closeSide,
                settlementPrice: position.settlementPrice,
            },
            "POSITION_SETTLED"
        );

        if (position.instrument.instrumentType === "OPTION") {
            const intrinsic = Number(position.intrinsicValue || 0);
            if (intrinsic > EPSILON) {
                logger.warn(
                    {
                        event: "OPTION_EXERCISED",
                        userId: position.userId,
                        instrumentToken: position.instrumentToken,
                        optionType: position.optionType,
                        intrinsicValue: intrinsic,
                    },
                    "OPTION_EXERCISED"
                );
            } else {
                logger.warn(
                    {
                        event: "OPTION_EXPIRED",
                        userId: position.userId,
                        instrumentToken: position.instrumentToken,
                        optionType: position.optionType,
                    },
                    "OPTION_EXPIRED"
                );
            }
        }

        return true;
    }

    private async refreshRiskAndWalletState(userIds: string[], force: boolean): Promise<void> {
        try {
            await mtmEngineService.forceRefreshOpenState();
            mtmEngineService.requestRefresh();
        } catch (error) {
            logger.error({ err: error }, "MTM refresh failed after expiry settlement");
        }

        await Promise.all(
            userIds.map(async (userId) => {
                const snapshot = mtmEngineService.getUserSnapshot(userId);
                if (snapshot) {
                    await liquidationEngineService.evaluateFromMtm(userId, {
                        equity: snapshot.equity,
                        requiredMargin: snapshot.requiredMargin,
                        maintenanceMargin: snapshot.maintenanceMargin,
                        accountState: snapshot.accountState,
                    }, { force });
                }

                const wallet = await WalletService.getWallet(userId);
                logger.info(
                    {
                        event: "ACCOUNT_UPDATED",
                        userId,
                        balance: Number(wallet.balance),
                        equity: snapshot?.equity ?? Number(wallet.equity),
                        accountState: snapshot?.accountState ?? wallet.accountState,
                    },
                    "ACCOUNT_UPDATED"
                );
            })
        );
    }

    private isSettlementWindow(now: Date): boolean {
        const parts = toIstParts(now);
        const nowMinutes = parts.hour * 60 + parts.minute;
        return nowMinutes >= SETTLEMENT_WINDOW_START_MINUTES;
    }

    private async getInstrumentByToken(
        instrumentToken: string,
        repo: InstrumentRepository
    ): Promise<Instrument | null> {
        const [row] = await db
            .select()
            .from(instruments)
            .where(eq(instruments.instrumentToken, instrumentToken))
            .limit(1);

        if (row) return row;

        const cached = repo.get(instrumentToken);
        if (cached) return cached;

        return null;
    }

    private async resolveDeterministicPrice(instrumentToken: string, now: Date): Promise<PriceResolution> {
        const nowMs = now.getTime();
        const quote = realTimeMarketService.getQuote(instrumentToken);
        if (quote && Number.isFinite(quote.price) && quote.price > 0 && isTickFresh(quote.lastUpdated, nowMs)) {
            return {
                price: Number(quote.price),
                source: "REALTIME",
            };
        }

        const mtmPrice = mtmEngineService.getLatestPrice(instrumentToken, STALE_TICK_MS);
        if (Number.isFinite(mtmPrice) && (mtmPrice as number) > 0) {
            return {
                price: Number(mtmPrice),
                source: "MTM",
            };
        }

        const closeFromCache = this.closePriceCache.get(instrumentToken);
        if (Number.isFinite(closeFromCache) && (closeFromCache as number) > 0) {
            return {
                price: Number(closeFromCache),
                source: "PREV_CLOSE",
            };
        }

        const quoteClose = Number(quote?.close);
        if (Number.isFinite(quoteClose) && quoteClose > 0) {
            this.closePriceCache.set(instrumentToken, quoteClose);
            return {
                price: quoteClose,
                source: "PREV_CLOSE",
            };
        }

        const details = await UpstoxService.getSystemQuoteDetails([instrumentToken]);
        const detail = details[instrumentToken] || details[instrumentToken.replace("|", ":")];
        const previousClose = Number(detail?.closePrice);
        const fallbackLast = Number(detail?.lastPrice);
        const resolvedClose = Number.isFinite(previousClose) && previousClose > 0
            ? previousClose
            : Number.isFinite(fallbackLast) && fallbackLast > 0
                ? fallbackLast
                : NaN;

        if (!Number.isFinite(resolvedClose) || resolvedClose <= 0) {
            logger.error(
                {
                    event: "SETTLEMENT_SYNTHETIC_PRICE_USED",
                    instrumentToken,
                    fallbackPrice: SETTLEMENT_SYNTHETIC_PRICE,
                },
                "Settlement price unavailable, using synthetic fallback"
            );
            return {
                price: SETTLEMENT_SYNTHETIC_PRICE,
                source: "SYNTHETIC",
            };
        }

        this.closePriceCache.set(instrumentToken, resolvedClose);
        return {
            price: resolvedClose,
            source: "PREV_CLOSE",
        };
    }

    private async resolveUnderlyingToken(optionInstrument: Instrument): Promise<string> {
        const key = `${optionInstrument.name}`.toUpperCase();
        const cached = this.underlyingTokenCache.get(key);
        if (cached) return cached;

        const [row] = await db
            .select({
                instrumentToken: instruments.instrumentToken,
            })
            .from(instruments)
            .where(
                and(
                    eq(instruments.isActive, true),
                    inArray(instruments.instrumentType, ["INDEX", "EQUITY"]),
                    sql`upper(${instruments.tradingsymbol}) = upper(${optionInstrument.name}) OR upper(${instruments.name}) = upper(${optionInstrument.name})`
                )
            )
            .limit(1);

        if (row?.instrumentToken) {
            this.underlyingTokenCache.set(key, row.instrumentToken);
            return row.instrumentToken;
        }

        const resolved = await UpstoxService.resolveInstrumentKey(optionInstrument.name);
        if (!resolved) {
            throw new ApiError(`Underlying token missing for ${optionInstrument.instrumentToken}`, 404, "UNDERLYING_NOT_FOUND");
        }

        this.underlyingTokenCache.set(key, resolved);
        return resolved;
    }
}

declare global {
    var __expirySettlementServiceInstance: ExpirySettlementService | undefined;
}

const globalState = globalThis as unknown as {
    __expirySettlementServiceInstance?: ExpirySettlementService;
};

export const expirySettlementService =
    globalState.__expirySettlementServiceInstance || new ExpirySettlementService();

globalState.__expirySettlementServiceInstance = expirySettlementService;
