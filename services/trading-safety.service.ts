import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, type Instrument } from "@/lib/db/schema";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { UpstoxService } from "@/services/upstox.service";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { marketSimulation } from "@/services/market-simulation.service";
import type { PlaceOrder } from "@/lib/validation/oms";
import { PreTradeRiskService } from "@/services/pretrade-risk.service";

const STALE_TICK_MAX_AGE_SECONDS = 8;
const OPTION_MIN_OI = 500;
const DUPLICATE_WINDOW_MS = 2000;
const OPTION_QUOTE_TIMEOUT_MS = 1200;
const PAPER_TRADING_MODE =
    String(process.env.PAPER_TRADING_MODE ?? "true").trim().toLowerCase() !== "false";
const DISABLE_CONCENTRATION_CHECK =
    String(process.env.DISABLE_CONCENTRATION_CHECK ?? (PAPER_TRADING_MODE ? "true" : "false"))
        .trim()
        .toLowerCase() === "true";

export type TradingSafetyValidationResult = {
    validatedAt: number;
    referencePrice: number;
    estimatedOrderNotional: number;
};

type TradingSafetyValidationOptions = {
    skipExpiryCheck?: boolean;
};

export class TradingSafetyService {
    static async validate(
        userId: string,
        order: PlaceOrder,
        instrument: Instrument,
        options: TradingSafetyValidationOptions = {}
    ): Promise<TradingSafetyValidationResult> {
        const now = new Date();
        if (!options.skipExpiryCheck) {
            this.validateExpiry(instrument, now);
        }
        this.validateLotSize(order.quantity, instrument.lotSize);
        await this.validateDuplicateOrder(userId, order);
        if (!PAPER_TRADING_MODE && !DISABLE_CONCENTRATION_CHECK) {
            await PreTradeRiskService.validateOrder(userId, order, instrument);
        } else {
            logger.warn(
                {
                    event: "SIMULATION_MODE_PRETRADE_RISK_SKIPPED",
                    userId,
                    instrumentToken: instrument.instrumentToken,
                    paperTradingMode: PAPER_TRADING_MODE,
                    disableConcentrationCheck: DISABLE_CONCENTRATION_CHECK,
                },
                "Skipping broker-style pretrade risk checks in simulation mode"
            );
        }

        const quote = this.resolveMarketQuote(instrument);
        const referencePrice = this.resolveReferencePrice(order, quote);
        const estimatedOrderNotional = Math.max(0, referencePrice * order.quantity);

        this.validateStaleMarketOrder(order, instrument, quote, now);
        await this.validateOptionLiquidity(instrument, quote);

        return {
            validatedAt: now.getTime(),
            referencePrice,
            estimatedOrderNotional,
        };
    }

    private static validateExpiry(instrument: Instrument, now: Date): void {
        if (!instrument.expiry) return;

        const expiryTime = new Date(instrument.expiry).getTime();
        if (!Number.isFinite(expiryTime)) {
            throw new ApiError("Instrument expiry is invalid", 400, "EXPIRED_INSTRUMENT");
        }

        if (expiryTime <= now.getTime()) {
            throw new ApiError(
                `Instrument expired on ${new Date(expiryTime).toISOString()}`,
                400,
                "EXPIRED_INSTRUMENT"
            );
        }
    }

    private static validateLotSize(quantity: number, lotSize: number): void {
        if (lotSize <= 0 || quantity % lotSize !== 0) {
            if (PAPER_TRADING_MODE) {
                logger.warn(
                    {
                        event: "HIGH_RISK_SIMULATION_TRADE",
                        code: "INVALID_LOT_SIZE_SOFT",
                        quantity,
                        lotSize,
                    },
                    "Lot size mismatch allowed in simulation mode"
                );
                return;
            }
            throw new ApiError(
                `Quantity ${quantity} is not a valid multiple of lot size ${lotSize}`,
                400,
                "INVALID_LOT_SIZE"
            );
        }
    }

    private static async validateDuplicateOrder(userId: string, order: PlaceOrder): Promise<void> {
        if (order.idempotencyKey) {
            const [existing] = await db
                .select({ id: orders.id })
                .from(orders)
                .where(
                    and(
                        eq(orders.userId, userId),
                        eq(orders.idempotencyKey, order.idempotencyKey)
                    )
                )
                .limit(1);

            if (existing) {
                throw new ApiError("Duplicate order idempotency key", 409, "DUPLICATE_ORDER");
            }
            return;
        }

        const windowStart = new Date(Date.now() - DUPLICATE_WINDOW_MS);
        const duplicateConditions = [
            eq(orders.userId, userId),
            eq(orders.instrumentToken, order.instrumentToken),
            eq(orders.side, order.side),
            eq(orders.quantity, order.quantity),
            eq(orders.orderType, order.orderType),
            gte(orders.createdAt, windowStart),
        ];

        if (order.orderType === "LIMIT") {
            duplicateConditions.push(eq(orders.limitPrice, order.limitPrice.toString()));
        }

        const [recentDuplicate] = await db
            .select({ id: orders.id })
            .from(orders)
            .where(and(...duplicateConditions))
            .limit(1);

        if (recentDuplicate) {
            if (PAPER_TRADING_MODE) {
                logger.warn(
                    {
                        event: "HIGH_RISK_SIMULATION_TRADE",
                        code: "DUPLICATE_ORDER_SOFT",
                        userId,
                        instrumentToken: order.instrumentToken,
                    },
                    "Rapid duplicate order allowed in simulation mode"
                );
                return;
            }
            throw new ApiError("Rapid duplicate order blocked", 409, "DUPLICATE_ORDER");
        }
    }

    private static resolveMarketQuote(instrument: Instrument): {
        price: number;
        lastUpdatedMs: number | null;
        volume: number | null;
    } {
        const liveQuote = realTimeMarketService.getQuote(instrument.instrumentToken);
        if (liveQuote && Number.isFinite(liveQuote.price) && liveQuote.price > 0) {
            const updated = liveQuote.lastUpdated instanceof Date
                ? liveQuote.lastUpdated.getTime()
                : Date.now();
            const volume = Number(liveQuote.volume);
            return {
                price: Number(liveQuote.price),
                lastUpdatedMs: Number.isFinite(updated) ? updated : null,
                volume: Number.isFinite(volume) ? Math.max(0, volume) : null,
            };
        }

        const simulated = marketSimulation.getQuote(instrument.tradingsymbol);
        if (simulated && Number.isFinite(simulated.price) && simulated.price > 0) {
            const updated = simulated.lastUpdated instanceof Date
                ? simulated.lastUpdated.getTime()
                : Date.now();
            return {
                price: Number(simulated.price),
                lastUpdatedMs: Number.isFinite(updated) ? updated : null,
                volume: null,
            };
        }

        return {
            price: 0,
            lastUpdatedMs: null,
            volume: null,
        };
    }

    private static resolveReferencePrice(
        order: PlaceOrder,
        quote: { price: number }
    ): number {
        if (order.orderType === "LIMIT") {
            return order.limitPrice;
        }

        if (Number.isFinite(quote.price) && quote.price > 0) {
            return quote.price;
        }

        return 0;
    }

    private static validateStaleMarketOrder(
        order: PlaceOrder,
        instrument: Instrument,
        quote: { lastUpdatedMs: number | null; price: number },
        now: Date
    ): void {
        if (order.orderType !== "MARKET") return;

        if (!Number.isFinite(quote.price) || quote.price <= 0) {
            if (PAPER_TRADING_MODE) {
                logger.warn(
                    {
                        event: "HIGH_RISK_SIMULATION_TRADE",
                        code: "STALE_PRICE_SOFT",
                        instrumentToken: instrument.instrumentToken,
                    },
                    "No usable tick for market order, allowed in simulation mode"
                );
                return;
            }
            throw new ApiError(
                `No usable tick for ${instrument.tradingsymbol}`,
                503,
                "STALE_PRICE"
            );
        }

        const updatedAt = quote.lastUpdatedMs;
        if (!updatedAt || !Number.isFinite(updatedAt)) {
            if (PAPER_TRADING_MODE) {
                logger.warn(
                    {
                        event: "HIGH_RISK_SIMULATION_TRADE",
                        code: "STALE_PRICE_SOFT",
                        instrumentToken: instrument.instrumentToken,
                    },
                    "Missing tick timestamp, allowed in simulation mode"
                );
                return;
            }
            throw new ApiError(
                `No tick timestamp for ${instrument.tradingsymbol}`,
                503,
                "STALE_PRICE"
            );
        }

        const ageSeconds = (now.getTime() - updatedAt) / 1000;
        if (ageSeconds > STALE_TICK_MAX_AGE_SECONDS) {
            if (PAPER_TRADING_MODE) {
                logger.warn(
                    {
                        event: "HIGH_RISK_SIMULATION_TRADE",
                        code: "STALE_PRICE_SOFT",
                        instrumentToken: instrument.instrumentToken,
                        ageSeconds,
                    },
                    "Stale market tick allowed in simulation mode"
                );
                return;
            }
            throw new ApiError(
                `Tick is stale (${Math.round(ageSeconds)}s old)`,
                503,
                "STALE_PRICE"
            );
        }
    }

    private static async validateOptionLiquidity(
        instrument: Instrument,
        quote: { volume: number | null }
    ): Promise<void> {
        if (instrument.instrumentType !== "OPTION") return;

        let volume = Number.isFinite(quote.volume) ? Number(quote.volume) : 0;
        let oi = 0;

        try {
            const details = await Promise.race([
                UpstoxService.getSystemQuoteDetails([instrument.instrumentToken]),
                new Promise<Record<string, { volume?: number | null; oi?: number | null }> | null>((resolve) =>
                    setTimeout(() => resolve(null), OPTION_QUOTE_TIMEOUT_MS)
                ),
            ]);

            if (!details) {
                throw new Error("OPTION_QUOTE_TIMEOUT");
            }

            const detail =
                details[instrument.instrumentToken] ||
                details[instrument.instrumentToken.replace("|", ":")];

            if (detail) {
                const rawVolume = Number(detail.volume);
                const rawOi = Number(detail.oi);
                if (Number.isFinite(rawVolume)) {
                    volume = Math.max(0, rawVolume);
                }
                if (Number.isFinite(rawOi)) {
                    oi = Math.max(0, rawOi);
                }
            }
        } catch {
            // Keep conservative defaults (0/0) when quote details are unavailable.
        }

        if (oi < OPTION_MIN_OI || volume === 0) {
            if (PAPER_TRADING_MODE) {
                logger.warn(
                    {
                        event: "HIGH_RISK_SIMULATION_TRADE",
                        code: "ILLIQUID_CONTRACT_SOFT",
                        instrumentToken: instrument.instrumentToken,
                        oi,
                        volume,
                    },
                    "Option liquidity guard softened in simulation mode"
                );
                return;
            }
            throw new ApiError(
                `Option liquidity check failed (oi=${oi}, volume=${volume})`,
                400,
                "ILLIQUID_CONTRACT"
            );
        }
    }

}
