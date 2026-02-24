import { db } from "@/lib/db";
import { orders, positions, type Instrument, type NewOrder } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/errors";
import { eq, and, sql } from "drizzle-orm";
import { performance } from "node:perf_hooks";
import type { PlaceOrder, OrderQuery } from "@/lib/validation/oms";
import { WalletService } from "@/services/wallet.service";
import { MarginService } from "@/services/margin.service";
import { ExecutionService } from "@/services/execution.service";
import { TradingSafetyService } from "@/services/trading-safety.service";
import { PreTradeRiskService } from "@/services/pretrade-risk.service";
import { assertTradingEnabled } from "@/lib/system-control";
import { assertFeedHealthy } from "@/services/feed-health.service";
import { OrderAcceptanceService } from "@/services/order-acceptance.service";

import { isInstrumentAllowed } from "@/lib/trading-universe";
import { requireInstrumentTokenForIdentityLookup } from "@/lib/trading/token-identity-guard";
import { instrumentStore } from "@/stores/instrument.store";

const IST_TIME_ZONE = "Asia/Kolkata";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const ALLOW_AFTER_HOURS_ORDER_STAGING =
    process.env.NODE_ENV !== "production" &&
    TRUE_VALUES.has(String(process.env.ALLOW_AFTER_HOURS_ORDER_STAGING ?? "false").trim().toLowerCase());
const PAPER_TRADING_MODE =
    String(process.env.PAPER_TRADING_MODE ?? "true").trim().toLowerCase() !== "false";

function isApiErrorLike(
    error: unknown
): error is { message: string; statusCode: number; code: string } {
    if (!error || typeof error !== "object") return false;
    const maybe = error as { message?: unknown; statusCode?: unknown; code?: unknown };
    return (
        typeof maybe.message === "string" &&
        typeof maybe.statusCode === "number" &&
        typeof maybe.code === "string"
    );
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
    const todayDay = toIstDayNumber(now);
    return Math.round((expiryDay - todayDay) / MS_PER_DAY);
}

function getIstClock(now: Date): { day: number; hour: number; minute: number } {
    const parts = new Intl.DateTimeFormat("en-IN", {
        timeZone: IST_TIME_ZONE,
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

function isInstrumentSessionClosed(instrument: Instrument, now: Date): boolean {
    const { day, hour, minute } = getIstClock(now);
    if (day === 0 || day === 6) return true;

    const mins = hour * 60 + minute;
    const open = 9 * 60 + 15;
    const foClose = 15 * 60 + 30;
    const eqClose = 15 * 60 + 30;

    if (instrument.segment === "NSE_FO") {
        return mins < open || mins > foClose;
    }

    if (instrument.segment === "NSE_EQ") {
        return mins < open || mins > eqClose;
    }

    return false;
}

export class OrderService {
    /**
     * Place a new order with idempotency support.
     */
    static async placeOrder(
        userId: string,
        payload: PlaceOrder,
        options: { force?: boolean } = {}
    ) {
        const startMs = performance.now();
        let orderValidationMs = 0;
        let marginMs = 0;
        let executionMs = 0;

        try {
            assertTradingEnabled({ force: options.force, context: "OrderService.placeOrder" });
            // Check idempotency key if provided
// Idempotency check removed for simplification


            // Validate instrument exists and is active
            logger.info({ lookupSymbol: payload.symbol, lookupToken: payload.instrumentToken }, "Looking up instrument");

            if (!instrumentStore.isReady()) {
                throw new ApiError("Instrument store not ready", 503, "INSTRUMENT_STORE_NOT_READY");
            }

            let instrumentToken: string;
            try {
                instrumentToken = requireInstrumentTokenForIdentityLookup({
                    context: "OrderService.placeOrder",
                    instrumentToken: payload.instrumentToken,
                    symbol: payload.symbol,
                });
            } catch (guardError) {
                throw new ApiError("Instrument Token REQUIRED", 400, "MISSING_INSTRUMENT_TOKEN");
            }

            const instrument = instrumentStore.getByToken(instrumentToken);

            if (instrument && instrument.tradingsymbol !== payload.symbol) {
                    logger.warn({ 
                        payloadSymbol: payload.symbol, 
                        instrumentSymbol: instrument.tradingsymbol,
                        token: payload.instrumentToken
                    }, "Symbol mismatch in order payload");
                    // We trust Token, but warn on mismatch
            }

            if (!instrument) {
                throw new ApiError("Invalid instrumentToken", 400, "INVALID_INSTRUMENT_TOKEN");
            }

            if (!instrument.isActive && payload.exitReason !== "EXPIRY") {
                 throw new ApiError("Instrument is inactive", 400, "INSTRUMENT_INACTIVE");
            }

            // Paper trading: expiry-day guard disabled — 0DTE trading is a valid practice use-case.
            const now = new Date();

            // --- TRADING UNIVERSE CHECK ---
            const universeCheck = isInstrumentAllowed(instrument);
            if (!universeCheck.allowed) {
                throw new ApiError(
                    `Trading not allowed: ${universeCheck.reason}`,
                    403,
                    "INSTRUMENT_NOT_ALLOWED"
                );
            }
            // -----------------------------

            const isForcedRiskFlow = Boolean(options.force || payload.exitReason === "EXPIRY");
            const marketClosed = isInstrumentSessionClosed(instrument, now);
            const stageAfterHours = !isForcedRiskFlow && marketClosed && ALLOW_AFTER_HOURS_ORDER_STAGING;

            if (marketClosed && !isForcedRiskFlow && !stageAfterHours) {
                throw new ApiError(
                    "Market is closed for this instrument",
                    400,
                    "MARKET_CLOSED"
                );
            }

            const validationStartMs = performance.now();
            if (!stageAfterHours && !isForcedRiskFlow) {
                assertFeedHealthy(instrument.instrumentToken);
                await OrderAcceptanceService.validateOrder(payload, instrument, { userId });

                if (!PAPER_TRADING_MODE) {
                    const safetyValidation = await TradingSafetyService.validate(
                        userId,
                        payload,
                        instrument,
                        { skipExpiryCheck: payload.exitReason === "EXPIRY" }
                    );
                    if (process.env.NODE_ENV !== "production" && !safetyValidation?.validatedAt) {
                        throw new Error("OrderService safety validation missing");
                    }
                }
            } else {
                if (!PAPER_TRADING_MODE) {
                    await PreTradeRiskService.validateOrder(userId, payload, instrument);
                }
            }
            orderValidationMs = performance.now() - validationStartMs;

            if (stageAfterHours) {
                logger.warn(
                    {
                        event: "ORDER_STAGED_AFTER_HOURS",
                        userId,
                        instrumentToken: instrument.instrumentToken,
                        orderType: payload.orderType,
                    },
                    "ORDER_STAGED_AFTER_HOURS"
                );
            }

            // Calculate required margin
            const marginStartMs = performance.now();
            const requiredMargin = await MarginService.calculateRequiredMargin(payload, instrument);
            marginMs = performance.now() - marginStartMs;
            logger.info({ userId, symbol: payload.symbol, requiredMargin }, "Margin calculated");

            // 🎯 PAPER TRADING: Simple balance check using wallet
            const availableBalance = await WalletService.getAvailableBalance(userId);
            
            if (requiredMargin > availableBalance) {
                throw new ApiError(
                    `Insufficient balance. Available: ₹${availableBalance.toFixed(2)}, Required: ₹${requiredMargin.toFixed(2)}`,
                    400,
                    "INSUFFICIENT_FUNDS"
                );
            }
            
            // Create order (simplified for paper trading)
            const newOrder: NewOrder = {
                userId,
                symbol: payload.symbol,
                instrumentToken: instrument.instrumentToken,
                side: payload.side,
                quantity: payload.quantity,
                orderType: payload.orderType,
                limitPrice:
                    payload.orderType === "LIMIT"
                        ? payload.limitPrice.toString()
                        : payload.exitReason === "EXPIRY" && Number.isFinite(payload.settlementPrice)
                            ? Number(payload.settlementPrice).toString()
                            : null,
                status: "OPEN",
                idempotencyKey: payload.idempotencyKey || null,
                exitReason: payload.exitReason || null,
            };

            const [order] = await db.insert(orders).values(newOrder).returning();

            logger.info({ orderId: order.id, userId, symbol: payload.symbol, availableBalance }, "Order placed (paper trading)");
            
            // ✅ Execute MARKET orders immediately
            if (payload.orderType === "MARKET" && !stageAfterHours) {
                const requiresImmediateSettlementFill = payload.exitReason === "EXPIRY";
                try {
                    logger.info({ orderId: order.id }, "Executing MARKET order immediately");
                    const executionStartMs = performance.now();
                    const executed = await ExecutionService.tryExecuteOrder(order, { force: options.force });
                    executionMs = performance.now() - executionStartMs;
                    if (requiresImmediateSettlementFill && !executed) {
                        throw new ApiError(
                            "Expiry settlement execution failed",
                            503,
                            "EXPIRY_EXECUTION_FAILED"
                        );
                    }
                } catch (error) {
                    logger.error({ err: error, orderId: order.id }, "Failed to execute MARKET order");
                    if (requiresImmediateSettlementFill) {
                        throw error;
                    }
                    // Don't throw for regular flow - order is placed, execution will be retried.
                }
            }

            const totalMs = performance.now() - startMs;
            const metricPayload = {
                event: "ORDER_PATH_TIMING",
                userId,
                orderId: order.id,
                instrumentToken: instrument.instrumentToken,
                order_validation_ms: Number(orderValidationMs.toFixed(2)),
                margin_ms: Number(marginMs.toFixed(2)),
                ledger_ms: 0,
                execution_ms: Number(executionMs.toFixed(2)),
                total_ms: Number(totalMs.toFixed(2)),
            };
            if (totalMs > 500) {
                logger.error(metricPayload, "ORDER_PATH_TIMING");
            } else if (totalMs > 250) {
                logger.warn(metricPayload, "ORDER_PATH_TIMING");
            } else {
                logger.info(metricPayload, "ORDER_PATH_TIMING");
            }
            
            return order;
        } catch (error) {
            console.error(error); // DEBUG: Raw stack trace
            if (error instanceof ApiError) throw error;
            if (isApiErrorLike(error)) {
                throw new ApiError(error.message, error.statusCode, error.code);
            }
            logger.error({ err: error, userId, payload }, "Failed to place order");
            throw new ApiError("Failed to place order", 500, "ORDER_PLACEMENT_FAILED");
        }
    }

    private static async enforceExpiryDayOpenGuard(
        _userId: string,
        _payload: PlaceOrder,
        _instrument: Instrument,
        _now: Date
    ): Promise<void> {
        // Paper trading: no expiry-day restrictions.
        // Opening new positions on expiry day (0DTE) is valid paper trading activity.
        return;
    }

    /**
     * Cancel an open order.
     */
    static async cancelOrder(userId: string, orderId: string) {
        try {
            const [order] = await db
                .select()
                .from(orders)
                .where(and(
                    eq(orders.id, orderId),
                    eq(orders.userId, userId)
                ))
                .limit(1);

            if (!order) {
                throw new ApiError("Order not found", 404, "NOT_FOUND");
            }

            // Validate state transition: only OPEN orders can be cancelled
            if (order.status !== "OPEN") {
                throw new ApiError(
                    `Cannot cancel order in ${order.status} state`,
                    400,
                    "INVALID_STATE_TRANSITION"
                );
            }

            // 🎯 SIMPLIFIED FOR PAPER TRADING: Just update status, no wallet operations
            const [cancelledOrder] = await db
                .update(orders)
                .set({
                    status: "CANCELLED",
                    updatedAt: new Date(),
                })
                .where(eq(orders.id, orderId))
                .returning();

            logger.info({ orderId, userId, symbol: order.symbol }, "Order cancelled (paper trading)");
            return cancelledOrder;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            logger.error({ err: error, userId, orderId }, "Failed to cancel order");
            throw new ApiError("Failed to cancel order", 500, "ORDER_CANCELLATION_FAILED");
        }
    }

    /**
     * Get orders for a user with optional filters.
     */
    static async getOrders(userId: string, filters: OrderQuery = {}) {
        try {
            const conditions = [eq(orders.userId, userId)];

            if (filters.status) {
                conditions.push(eq(orders.status, filters.status));
            }

            if (filters.symbol) {
                conditions.push(eq(orders.symbol, filters.symbol));
            }

            const limit = filters.limit || 20;
            const page = filters.page || 1;
            const offset = (page - 1) * limit;

            const results = await db
                .select()
                .from(orders)
                .where(and(...conditions))
                .orderBy(sql`${orders.createdAt} DESC`)
                .limit(limit)
                .offset(offset);

            return results;
        } catch (error) {
            logger.error({ err: error, userId, filters }, "Failed to get orders");
            throw new ApiError("Failed to retrieve orders", 500, "ORDER_RETRIEVAL_FAILED");
        }
    }
}

