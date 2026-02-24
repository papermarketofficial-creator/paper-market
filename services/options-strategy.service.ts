import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, type Instrument } from "@/lib/db/schema";
import { ApiError } from "@/lib/errors";
import { instrumentRepository } from "@/lib/instruments/repository";
import type {
    OptionStrategyExecuteInput,
    OptionStrategyPreviewInput,
    OptionStrategyType,
} from "@/lib/validation/options-strategy";
import type { PlaceOrder } from "@/lib/validation/oms";
import { MarginService } from "@/services/margin.service";
import { OrderService } from "@/services/order.service";
import type { SystemQuoteDetail } from "@/services/upstox.service";
import { UpstoxService } from "@/services/upstox.service";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { marketSimulation } from "@/services/market-simulation.service";
import { logger } from "@/lib/logger";

type OptionSide = "CE" | "PE";

type StrategyLegTemplate = {
    role: string;
    side: "BUY" | "SELL";
    optionType: OptionSide;
    strike: number;
};

type ResolvedLeg = StrategyLegTemplate & {
    instrumentToken: string;
    symbol: string;
    lotSize: number;
    quantity: number;
    ltp: number;
    premium: number;
};

type InternalResolvedLeg = ResolvedLeg & {
    instrument: Instrument;
};

type PayoffPoint = {
    spot: number;
    pnl: number;
};

type PreviewSummary = {
    totalPremium: number;
    premiumType: "DEBIT" | "CREDIT";
    requiredMargin: number;
    maxProfit: number | null;
    maxLoss: number | null;
    breakevens: number[];
};

export type StrategyPreviewResult = {
    strategy: OptionStrategyType;
    underlying: string;
    expiry: string;
    lots: number;
    legs: ResolvedLeg[];
    summary: PreviewSummary;
};

export type StrategyExecutionResult = {
    strategy: OptionStrategyType;
    underlying: string;
    expiry: string;
    lots: number;
    legs: Array<{
        role: string;
        side: "BUY" | "SELL";
        instrumentToken: string;
        symbol: string;
        quantity: number;
        idempotencyKey: string;
        status: "PLACED" | "DUPLICATE";
        orderId: string;
    }>;
};

const STRIKE_EPSILON = 0.001;

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function normalizeUnderlyingSymbol(raw: string): string {
    const value = String(raw || "").trim().toUpperCase();
    if (!value) return "";
    const compact = value.replace(/\s+/g, "");
    const aliases: Record<string, string> = {
        NIFTY50: "NIFTY",
        "NIFTY 50": "NIFTY",
        NIFTYBANK: "BANKNIFTY",
        "NIFTY BANK": "BANKNIFTY",
        NIFTYFINSERVICE: "FINNIFTY",
        "NIFTY FIN SERVICE": "FINNIFTY",
        MIDCPNIFTY: "MIDCAP",
        MIDCAP: "MIDCAP",
    };
    return aliases[value] || aliases[compact] || value;
}

function toDateKey(raw: Date | string | null | undefined): string {
    if (!raw) return "";
    const date = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
}

function sanitizeKey(input: string): string {
    return String(input || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "");
}

function buildStrategyLegTemplates(
    input: OptionStrategyPreviewInput
): StrategyLegTemplate[] {
    switch (input.strategy) {
        case "STRADDLE":
            return [
                {
                    role: "LONG_CALL",
                    side: "BUY",
                    optionType: "CE",
                    strike: input.strikes.centerStrike,
                },
                {
                    role: "LONG_PUT",
                    side: "BUY",
                    optionType: "PE",
                    strike: input.strikes.centerStrike,
                },
            ];
        case "STRANGLE":
            return [
                {
                    role: "LONG_PUT",
                    side: "BUY",
                    optionType: "PE",
                    strike: input.strikes.putStrike,
                },
                {
                    role: "LONG_CALL",
                    side: "BUY",
                    optionType: "CE",
                    strike: input.strikes.callStrike,
                },
            ];
        case "IRON_CONDOR":
            return [
                {
                    role: "LONG_PUT_WING",
                    side: "BUY",
                    optionType: "PE",
                    strike: input.strikes.putLongStrike,
                },
                {
                    role: "SHORT_PUT_BODY",
                    side: "SELL",
                    optionType: "PE",
                    strike: input.strikes.putShortStrike,
                },
                {
                    role: "SHORT_CALL_BODY",
                    side: "SELL",
                    optionType: "CE",
                    strike: input.strikes.callShortStrike,
                },
                {
                    role: "LONG_CALL_WING",
                    side: "BUY",
                    optionType: "CE",
                    strike: input.strikes.callLongStrike,
                },
            ];
        case "BULL_CALL_SPREAD":
            return [
                {
                    role: "LONG_CALL",
                    side: "BUY",
                    optionType: "CE",
                    strike: input.strikes.longCallStrike,
                },
                {
                    role: "SHORT_CALL",
                    side: "SELL",
                    optionType: "CE",
                    strike: input.strikes.shortCallStrike,
                },
            ];
        case "BEAR_PUT_SPREAD":
            return [
                {
                    role: "LONG_PUT",
                    side: "BUY",
                    optionType: "PE",
                    strike: input.strikes.longPutStrike,
                },
                {
                    role: "SHORT_PUT",
                    side: "SELL",
                    optionType: "PE",
                    strike: input.strikes.shortPutStrike,
                },
            ];
        default:
            throw new ApiError("Unsupported strategy", 400, "STRATEGY_NOT_SUPPORTED");
    }
}

function findBreakevens(points: PayoffPoint[]): number[] {
    if (points.length < 2) return [];

    const out: number[] = [];
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (a.pnl === 0) {
            out.push(round2(a.spot));
            continue;
        }
        if (a.pnl * b.pnl > 0) continue;

        const denom = b.pnl - a.pnl;
        if (denom === 0) continue;
        const x = a.spot + ((0 - a.pnl) * (b.spot - a.spot)) / denom;
        if (Number.isFinite(x)) out.push(round2(x));
    }

    return Array.from(new Set(out.map((value) => value.toFixed(2)))).map((v) => Number(v));
}

function computeStrategySummary(
    strategy: OptionStrategyType,
    legs: ResolvedLeg[]
): PreviewSummary {
    const totalPremium = round2(
        legs.reduce((sum, leg) => sum + (leg.side === "BUY" ? leg.premium : -leg.premium), 0)
    );

    const allStrikes = legs.map((leg) => leg.strike);
    const minStrike = Math.min(...allStrikes);
    const maxStrike = Math.max(...allStrikes);
    const rangeLow = Math.max(1, Math.floor(minStrike * 0.5));
    const rangeHigh = Math.ceil(maxStrike * 1.5);
    const step = Math.max(1, Math.floor((rangeHigh - rangeLow) / 600));

    const points: PayoffPoint[] = [];
    let maxProfit = Number.NEGATIVE_INFINITY;
    let maxLoss = Number.POSITIVE_INFINITY;

    for (let spot = rangeLow; spot <= rangeHigh; spot += step) {
        const pnl = legs.reduce((sum, leg) => {
            const intrinsic =
                leg.optionType === "CE"
                    ? Math.max(spot - leg.strike, 0)
                    : Math.max(leg.strike - spot, 0);
            const unitPnl = leg.side === "BUY" ? intrinsic - leg.ltp : leg.ltp - intrinsic;
            return sum + unitPnl * leg.quantity;
        }, 0);

        maxProfit = Math.max(maxProfit, pnl);
        maxLoss = Math.min(maxLoss, pnl);
        points.push({ spot, pnl });
    }

    const breakevens = findBreakevens(points);
    const unlimitedProfit = strategy === "STRADDLE" || strategy === "STRANGLE";

    return {
        totalPremium: round2(totalPremium),
        premiumType: totalPremium >= 0 ? "DEBIT" : "CREDIT",
        requiredMargin: 0,
        maxProfit: unlimitedProfit ? null : round2(maxProfit),
        maxLoss: Number.isFinite(maxLoss) ? round2(Math.abs(Math.min(0, maxLoss))) : null,
        breakevens,
    };
}

export class OptionsStrategyService {
    static async previewStrategy(
        _userId: string,
        input: OptionStrategyPreviewInput
    ): Promise<StrategyPreviewResult> {
        const resolved = await this.resolveStrategyLegs(input);
        const legs: ResolvedLeg[] = resolved.map((leg) => ({
            role: leg.role,
            side: leg.side,
            optionType: leg.optionType,
            strike: leg.strike,
            instrumentToken: leg.instrumentToken,
            symbol: leg.symbol,
            lotSize: leg.lotSize,
            quantity: leg.quantity,
            ltp: leg.ltp,
            premium: leg.premium,
        }));
        let requiredMargin = 0;

        for (const leg of resolved) {
            const marginPayload: PlaceOrder = {
                instrumentToken: leg.instrumentToken,
                symbol: leg.symbol,
                side: leg.side,
                quantity: leg.quantity,
                orderType: "MARKET",
            };
            requiredMargin += await MarginService.calculateRequiredMargin(
                marginPayload,
                leg.instrument
            );
        }

        const summary = computeStrategySummary(input.strategy, legs);
        summary.requiredMargin = round2(requiredMargin);

        return {
            strategy: input.strategy,
            underlying: input.underlying,
            expiry: toDateKey(input.expiry),
            lots: input.lots,
            legs,
            summary,
        };
    }

    static async executeStrategy(
        userId: string,
        input: OptionStrategyExecuteInput
    ): Promise<StrategyExecutionResult> {
        const legs = await this.resolveStrategyLegs(input);
        const strategyKey = sanitizeKey(input.clientOrderKey).slice(0, 48);
        if (!strategyKey) {
            throw new ApiError("Invalid clientOrderKey", 400, "INVALID_STRATEGY_KEY");
        }

        const results: StrategyExecutionResult["legs"] = [];

        for (let index = 0; index < legs.length; index++) {
            const leg = legs[index];
            const idempotencyKey = `STRAT-${strategyKey}-${index + 1}`;

            try {
                const order = await OrderService.placeOrder(userId, {
                    symbol: leg.symbol,
                    instrumentToken: leg.instrumentToken,
                    side: leg.side,
                    quantity: leg.quantity,
                    orderType: "MARKET",
                    idempotencyKey,
                });

                results.push({
                    role: leg.role,
                    side: leg.side,
                    instrumentToken: leg.instrumentToken,
                    symbol: leg.symbol,
                    quantity: leg.quantity,
                    idempotencyKey,
                    status: "PLACED",
                    orderId: order.id,
                });
            } catch (error) {
                if (!(error instanceof ApiError) || error.code !== "DUPLICATE_ORDER") {
                    throw error;
                }

                const [existing] = await db
                    .select({ id: orders.id })
                    .from(orders)
                    .where(
                        and(
                            eq(orders.userId, userId),
                            eq(orders.idempotencyKey, idempotencyKey)
                        )
                    )
                    .limit(1);

                if (!existing?.id) {
                    throw new ApiError(
                        "Duplicate leg detected but original order missing",
                        409,
                        "STRATEGY_EXECUTION_INCONSISTENT"
                    );
                }

                results.push({
                    role: leg.role,
                    side: leg.side,
                    instrumentToken: leg.instrumentToken,
                    symbol: leg.symbol,
                    quantity: leg.quantity,
                    idempotencyKey,
                    status: "DUPLICATE",
                    orderId: existing.id,
                });
            }
        }

        return {
            strategy: input.strategy,
            underlying: input.underlying,
            expiry: toDateKey(input.expiry),
            lots: input.lots,
            legs: results,
        };
    }

    private static async resolveStrategyLegs(
        input: OptionStrategyPreviewInput
    ): Promise<InternalResolvedLeg[]> {
        await instrumentRepository.ensureInitialized();
        const templates = buildStrategyLegTemplates(input);
        const expiryKey = toDateKey(input.expiry);
        if (!expiryKey) {
            throw new ApiError("Invalid expiry", 400, "INVALID_EXPIRY");
        }

        const options = instrumentRepository
            .getOptionsByUnderlying(input.underlying)
            .filter((item) => toDateKey(item.expiry) === expiryKey);

        if (options.length === 0) {
            throw new ApiError(
                `No active options found for ${input.underlying} on ${expiryKey}`,
                404,
                "STRATEGY_OPTIONS_NOT_FOUND"
            );
        }

        const quoteMap = await UpstoxService.getSystemQuoteDetails(
            options.map((item) => item.instrumentToken)
        );
        const underlyingPrice = await this.resolveUnderlyingPrice(input.underlying);

        const resolved: InternalResolvedLeg[] = [];
        for (const leg of templates) {
            const instrument = options.find((candidate) => {
                const candidateType = String(candidate.optionType || "").toUpperCase();
                const strike = Number(candidate.strike || 0);
                return (
                    candidateType === leg.optionType &&
                    Math.abs(strike - leg.strike) < STRIKE_EPSILON
                );
            });

            if (!instrument) {
                throw new ApiError(
                    `${leg.optionType} strike ${leg.strike} not available on ${expiryKey}`,
                    404,
                    "STRATEGY_LEG_NOT_FOUND"
                );
            }

            const quantity = Math.max(1, Number(instrument.lotSize) * input.lots);
            const ltp = this.resolveLtp(instrument, quoteMap, underlyingPrice);
            const premium = round2(ltp * quantity);
            if (ltp <= 0) {
                throw new ApiError(
                    `Live premium unavailable for ${instrument.tradingsymbol}`,
                    503,
                    "STRATEGY_PRICE_UNAVAILABLE"
                );
            }

            resolved.push({
                role: leg.role,
                side: leg.side,
                optionType: leg.optionType,
                strike: leg.strike,
                instrumentToken: instrument.instrumentToken,
                symbol: instrument.tradingsymbol,
                lotSize: Number(instrument.lotSize),
                quantity,
                ltp: round2(ltp),
                premium,
                instrument,
            });
        }

        return resolved;
    }

    private static resolveLtp(
        instrument: Instrument,
        quotes: Record<string, SystemQuoteDetail>,
        underlyingPrice: number
    ): number {
        const detail =
            quotes[instrument.instrumentToken] ||
            quotes[instrument.instrumentToken.replace("|", ":")];
        const quoted = Number(detail?.lastPrice);
        if (Number.isFinite(quoted) && quoted > 0) return quoted;

        const live = realTimeMarketService.getQuote(instrument.instrumentToken);
        const livePrice = Number(live?.price);
        if (Number.isFinite(livePrice) && livePrice > 0) return livePrice;

        const simulation = marketSimulation.getQuote(instrument.tradingsymbol);
        const simulationPrice = Number(simulation?.price);
        if (Number.isFinite(simulationPrice) && simulationPrice > 0) return simulationPrice;

        const strike = Number(instrument.strike || 0);
        const optionType = String(instrument.optionType || "").toUpperCase();
        const synthetic = this.computeSyntheticOptionPrice(optionType, underlyingPrice, strike);
        if (synthetic > 0) {
            logger.warn(
                {
                    instrumentToken: instrument.instrumentToken,
                    symbol: instrument.tradingsymbol,
                    optionType,
                    strike,
                    underlyingPrice,
                    syntheticLtp: synthetic,
                },
                "Using synthetic premium for strategy preview"
            );
        }

        return synthetic;
    }

    private static computeSyntheticOptionPrice(
        optionType: string,
        underlyingPrice: number,
        strike: number
    ): number {
        const safeStrike = Number.isFinite(strike) && strike > 0 ? strike : 100;
        const safeUnderlying =
            Number.isFinite(underlyingPrice) && underlyingPrice > 0
                ? underlyingPrice
                : safeStrike;

        const intrinsic =
            optionType === "CE"
                ? Math.max(0, safeUnderlying - safeStrike)
                : Math.max(0, safeStrike - safeUnderlying);
        const timeValue = Math.max(10, safeUnderlying * 0.002);
        return round2(intrinsic + timeValue);
    }

    private static async resolveUnderlyingPrice(underlying: string): Promise<number> {
        const normalized = normalizeUnderlyingSymbol(underlying);

        const simulationPrice = Number(marketSimulation.getQuote(normalized)?.price || 0);
        let resolved = Number.isFinite(simulationPrice) && simulationPrice > 0 ? simulationPrice : 0;

        try {
            const instrumentKey = await UpstoxService.resolveInstrumentKey(normalized);
            const details = await UpstoxService.getSystemQuoteDetails([instrumentKey]);
            const detail = details[instrumentKey] || details[instrumentKey.replace("|", ":")];
            const upstreamPrice = Number(detail?.lastPrice || 0);
            if (Number.isFinite(upstreamPrice) && upstreamPrice > 0) {
                resolved = upstreamPrice;
            }
        } catch {
            // keep best available fallback
        }

        return resolved;
    }
}
