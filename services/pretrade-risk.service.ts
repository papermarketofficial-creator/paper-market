import type { PlaceOrder } from "@/lib/validation/oms";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Instrument } from "@/lib/db/schema";
import { mtmEngineService } from "@/services/mtm-engine.service";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { WalletService } from "@/services/wallet.service";
import { instrumentStore } from "@/stores/instrument.store";

type RiskPosition = {
    instrumentToken: string;
    quantity: number;
    instrumentType: string;
    markPrice: number;
};

type WalletFallback = {
    equity: number;
    atMs: number;
};

type ProjectedPosition = {
    instrumentToken: string;
    quantity: number;
    instrumentType: string;
    markPrice: number;
    notional: number;
};

const EPSILON = 0.000001;
const IST_TIME_ZONE = "Asia/Kolkata";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_ACCOUNT_LEVERAGE = Number(process.env.MAX_ACCOUNT_LEVERAGE ?? "5");
const DEFAULT_MAX_POSITION_NOTIONAL = Number(process.env.MAX_POSITION_NOTIONAL_PER_SYMBOL ?? "2000000");
const DEFAULT_MAX_DERIVATIVE_NOTIONAL = Number(process.env.MAX_DERIVATIVE_NOTIONAL ?? "5000000");
const DEFAULT_CONCENTRATION_LIMIT = Number(process.env.MAX_SINGLE_INSTRUMENT_CONCENTRATION ?? "0.40");
const DEFAULT_MARGIN_BUFFER = Number(process.env.MIN_MARGIN_BUFFER_RATIO ?? "1.25");
const DEFAULT_WALLET_EQUITY = Number(process.env.DEFAULT_WALLET_BALANCE ?? "1000000");
const WALLET_FALLBACK_TTL_MS = Number(process.env.PRETRADE_WALLET_CACHE_TTL_MS ?? "3000");

function toNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPositive(value: number, fallback: number): number {
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return value;
}

function toIstDayNumber(date: Date): number {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: IST_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);

    const year = Number(parts.find((part) => part.type === "year")?.value || 0);
    const month = Number(parts.find((part) => part.type === "month")?.value || 0);
    const day = Number(parts.find((part) => part.type === "day")?.value || 0);
    return Date.UTC(year, month - 1, day);
}

function getDaysToExpiry(expiry: Date, now: Date): number {
    const expiryDay = toIstDayNumber(expiry);
    const today = toIstDayNumber(now);
    return Math.round((expiryDay - today) / MS_PER_DAY);
}

function isDerivative(instrumentType: string): boolean {
    return instrumentType === "FUTURE" || instrumentType === "OPTION";
}

function isIncreasingExposure(currentQty: number, projectedQty: number): boolean {
    if (Math.abs(projectedQty) <= EPSILON) return false;
    if (Math.abs(currentQty) <= EPSILON) return true;

    const currentSign = Math.sign(currentQty);
    const projectedSign = Math.sign(projectedQty);
    if (currentSign !== projectedSign) {
        return Math.abs(projectedQty) > EPSILON;
    }

    return Math.abs(projectedQty) > Math.abs(currentQty) + EPSILON;
}

function computeRequiredMargin(instrumentType: string, quantity: number, markPrice: number): number {
    const notional = Math.abs(quantity) * markPrice;
    if (instrumentType === "FUTURE") return notional * 0.15;
    if (instrumentType === "OPTION") return quantity >= 0 ? notional : notional * 1.2;
    return notional;
}

export class PreTradeRiskService {
    private static walletCache = new Map<string, WalletFallback>();

    static async validateOrder(
        userId: string,
        payload: PlaceOrder,
        instrument: Instrument
    ): Promise<{ allowed: true }> {
        if (!instrumentStore.isReady()) {
            throw new ApiError("Instrument store not ready", 503, "INSTRUMENT_STORE_NOT_READY");
        }

        const equity = await this.resolveEquity(userId);
        const currentPositions = this.getCurrentPositions(userId);
        const projected = this.buildProjectedPositions(currentPositions, payload, instrument);

        const totalNotional = projected.reduce((sum, item) => sum + item.notional, 0);
        const derivativeNotional = projected
            .filter((item) => isDerivative(item.instrumentType))
            .reduce((sum, item) => sum + item.notional, 0);

        const projectedCurrent = projected.find((item) => item.instrumentToken === instrument.instrumentToken);
        const currentBefore = currentPositions.find((item) => item.instrumentToken === instrument.instrumentToken);
        const currentQty = currentBefore?.quantity ?? 0;
        const projectedQty = projectedCurrent?.quantity ?? 0;
        const projectedCurrentNotional = projectedCurrent?.notional ?? 0;

        const effectiveLeverage = equity > EPSILON ? totalNotional / equity : Number.POSITIVE_INFINITY;
        const maxLeverage = clampPositive(DEFAULT_ACCOUNT_LEVERAGE, 5);
        if (effectiveLeverage > maxLeverage) {
            this.reject(
                "LEVERAGE_EXCEEDED",
                "Effective leverage exceeds configured limit",
                {
                    userId,
                    instrumentToken: instrument.instrumentToken,
                    effectiveLeverage,
                    maxLeverage,
                    equity,
                    totalNotional,
                }
            );
        }

        const maxPositionNotional = clampPositive(DEFAULT_MAX_POSITION_NOTIONAL, 2_000_000);
        if (projectedCurrentNotional > maxPositionNotional) {
            this.reject(
                "POSITION_LIMIT_EXCEEDED",
                "Projected position notional exceeds per-instrument limit",
                {
                    userId,
                    instrumentToken: instrument.instrumentToken,
                    projectedCurrentNotional,
                    maxPositionNotional,
                }
            );
        }

        const maxDerivativeNotional = clampPositive(DEFAULT_MAX_DERIVATIVE_NOTIONAL, 5_000_000);
        if (derivativeNotional > maxDerivativeNotional) {
            this.reject(
                "DERIVATIVE_EXPOSURE_TOO_HIGH",
                "Projected derivative notional exceeds configured cap",
                {
                    userId,
                    instrumentToken: instrument.instrumentToken,
                    derivativeNotional,
                    maxDerivativeNotional,
                }
            );
        }

        const concentrationLimit = clampPositive(DEFAULT_CONCENTRATION_LIMIT, 0.40);
        const concentrationRatio = equity > EPSILON ? projectedCurrentNotional / equity : Number.POSITIVE_INFINITY;
        if (concentrationRatio > concentrationLimit) {
            this.reject(
                "CONCENTRATION_RISK",
                "Projected concentration exceeds account concentration threshold",
                {
                    userId,
                    instrumentToken: instrument.instrumentToken,
                    projectedCurrentNotional,
                    equity,
                    concentrationRatio,
                    concentrationLimit,
                }
            );
        }

        const projectedRequiredMargin = projected.reduce(
            (sum, item) => sum + computeRequiredMargin(item.instrumentType, item.quantity, item.markPrice),
            0
        );
        const minMarginBuffer = clampPositive(DEFAULT_MARGIN_BUFFER, 1.25);
        const projectedBuffer = projectedRequiredMargin > EPSILON
            ? equity / projectedRequiredMargin
            : Number.POSITIVE_INFINITY;
        if (projectedBuffer <= minMarginBuffer) {
            this.reject(
                "INSUFFICIENT_MARGIN_BUFFER",
                "Projected margin buffer would breach minimum threshold",
                {
                    userId,
                    instrumentToken: instrument.instrumentToken,
                    projectedBuffer,
                    minMarginBuffer,
                    equity,
                    projectedRequiredMargin,
                }
            );
        }

        if (instrument.instrumentType === "OPTION" && instrument.expiry) {
            const now = new Date();
            const daysToExpiry = getDaysToExpiry(new Date(instrument.expiry), now);
            const openingNewRisk = isIncreasingExposure(currentQty, projectedQty);
            if (openingNewRisk && daysToExpiry < 1) {
                this.reject(
                    "EXPIRY_RISK_BLOCK",
                    "Opening new option exposure is blocked near expiry",
                    {
                        userId,
                        instrumentToken: instrument.instrumentToken,
                        daysToExpiry,
                        currentQty,
                        projectedQty,
                    }
                );
            }
        }

        return { allowed: true };
    }

    private static getCurrentPositions(userId: string): RiskPosition[] {
        const positions = mtmEngineService.getUserRiskPositions(userId);
        return positions.map((item) => ({
            instrumentToken: item.instrumentToken,
            quantity: item.quantity,
            instrumentType: item.instrumentType,
            markPrice: Math.max(0.01, toNumber(item.markPrice, item.averagePrice)),
        }));
    }

    private static buildProjectedPositions(
        current: RiskPosition[],
        payload: PlaceOrder,
        instrument: Instrument
    ): ProjectedPosition[] {
        const qtyDelta = payload.side === "BUY" ? payload.quantity : -payload.quantity;
        const nextByToken = new Map<string, RiskPosition>();

        for (const row of current) {
            nextByToken.set(row.instrumentToken, { ...row });
        }

        const referencePrice = this.resolveReferencePrice(payload, instrument);
        const existing = nextByToken.get(instrument.instrumentToken);
        if (existing) {
            existing.quantity += qtyDelta;
            existing.markPrice = Math.max(0.01, referencePrice);
            existing.instrumentType = instrument.instrumentType;
        } else {
            nextByToken.set(instrument.instrumentToken, {
                instrumentToken: instrument.instrumentToken,
                quantity: qtyDelta,
                instrumentType: instrument.instrumentType,
                markPrice: Math.max(0.01, referencePrice),
            });
        }

        const projected: ProjectedPosition[] = [];
        for (const item of nextByToken.values()) {
            if (Math.abs(item.quantity) <= EPSILON) continue;
            const instType =
                item.instrumentType ||
                instrumentStore.getByToken(item.instrumentToken)?.instrumentType ||
                "EQUITY";
            const markPrice = Math.max(0.01, toNumber(item.markPrice, 0.01));
            projected.push({
                instrumentToken: item.instrumentToken,
                quantity: item.quantity,
                instrumentType: instType,
                markPrice,
                notional: Math.abs(item.quantity) * markPrice,
            });
        }

        return projected;
    }

    private static resolveReferencePrice(payload: PlaceOrder, instrument: Instrument): number {
        if (payload.orderType === "LIMIT") {
            return Math.max(0.01, Number(payload.limitPrice));
        }

        if (Number.isFinite(Number(payload.settlementPrice)) && Number(payload.settlementPrice) > 0) {
            return Number(payload.settlementPrice);
        }

        const mtmPrice = mtmEngineService.getLatestPrice(instrument.instrumentToken);
        if (Number.isFinite(mtmPrice) && (mtmPrice as number) > 0) {
            return Number(mtmPrice);
        }

        const live = realTimeMarketService.getQuote(instrument.instrumentToken);
        const livePrice = Number(live?.price);
        if (Number.isFinite(livePrice) && livePrice > 0) {
            return livePrice;
        }

        const close = Number(live?.close);
        if (Number.isFinite(close) && close > 0) {
            return close;
        }

        return Math.max(0.01, Number(instrument.tickSize || "0.05"));
    }

    private static async resolveEquity(userId: string): Promise<number> {
        const snapshot = mtmEngineService.getUserSnapshot(userId);
        const snapshotEquity = toNumber(snapshot?.equity, NaN);
        if (Number.isFinite(snapshotEquity) && snapshotEquity > EPSILON) {
            return snapshotEquity;
        }

        const nowMs = Date.now();
        const cached = this.walletCache.get(userId);
        if (cached && nowMs - cached.atMs <= WALLET_FALLBACK_TTL_MS) {
            return cached.equity;
        }

        const wallet = await WalletService.getWallet(userId);
        const walletEquity = toNumber(wallet.equity, toNumber(wallet.balance, DEFAULT_WALLET_EQUITY));
        const normalized = walletEquity > EPSILON ? walletEquity : DEFAULT_WALLET_EQUITY;
        this.walletCache.set(userId, { equity: normalized, atMs: nowMs });
        return normalized;
    }

    private static reject(
        code:
            | "LEVERAGE_EXCEEDED"
            | "POSITION_LIMIT_EXCEEDED"
            | "DERIVATIVE_EXPOSURE_TOO_HIGH"
            | "CONCENTRATION_RISK"
            | "INSUFFICIENT_MARGIN_BUFFER"
            | "EXPIRY_RISK_BLOCK",
        message: string,
        details: Record<string, unknown>
    ): never {
        logger.warn(
            {
                event: "PRETRADE_RISK_REJECTED",
                code,
                ...details,
            },
            "PRETRADE_RISK_REJECTED"
        );
        throw new ApiError(message, 400, code);
    }
}
