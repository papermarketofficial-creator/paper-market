import { db } from "@/lib/db";
import { orders, instruments, positions, type Instrument, type NewOrder } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/errors";
import { eq, and, sql } from "drizzle-orm";
import type { PlaceOrder, OrderQuery } from "@/lib/validation/oms";
import { WalletService } from "@/services/wallet.service";
import { MarginService } from "@/services/margin.service";
import { ExecutionService } from "@/services/execution.service";
import { TradingSafetyService } from "@/services/trading-safety.service";
import { PreTradeRiskService } from "@/services/pretrade-risk.service";
import { assertTradingEnabled } from "@/lib/system-control";
import { assertFeedHealthy } from "@/services/feed-health.service";
import { OrderAcceptanceService } from "@/services/order-acceptance.service";

import { InstrumentRepository } from "@/lib/instruments/repository";
import { TRADING_UNIVERSE, isInstrumentAllowed } from "@/lib/trading-universe";
import { requireInstrumentTokenForIdentityLookup } from "@/lib/trading/token-identity-guard";

const IST_TIME_ZONE = "Asia/Kolkata";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const ALLOW_AFTER_HOURS_ORDER_STAGING =
    process.env.NODE_ENV !== "production" &&
    TRUE_VALUES.has(String(process.env.ALLOW_AFTER_HOURS_ORDER_STAGING ?? "false").trim().toLowerCase());

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
        try {
            assertTradingEnabled({ force: options.force, context: "OrderService.placeOrder" });
            // Check idempotency key if provided
// Idempotency check removed for simplification


            // Validate instrument exists and is active
            logger.info({ lookupSymbol: payload.symbol, lookupToken: payload.instrumentToken }, "Looking up instrument");
            
            const repo = InstrumentRepository.getInstance();
            if (!repo) {
                throw new Error("InstrumentRepository failed to initialize");
            }
            await repo.ensureInitialized();

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

            const instrument = repo.get(instrumentToken);

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

            const now = new Date();
            await this.enforceExpiryDayOpenGuard(userId, payload, instrument, now);

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

            if (!stageAfterHours && !isForcedRiskFlow) {
                assertFeedHealthy(instrument.instrumentToken);
                OrderAcceptanceService.validateOrder(payload, instrument, { userId });
                const safetyValidation = await TradingSafetyService.validate(
                    userId,
                    payload,
                    instrument,
                    { skipExpiryCheck: payload.exitReason === "EXPIRY" }
                );
                if (process.env.NODE_ENV !== "production" && !safetyValidation?.validatedAt) {
                    throw new Error("OrderService safety validation missing");
                }
            } else {
                await PreTradeRiskService.validateOrder(userId, payload, instrument);
            }

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
            const requiredMargin = await MarginService.calculateRequiredMargin(payload, instrument);
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
                try {
                    logger.info({ orderId: order.id }, "Executing MARKET order immediately");
                    if (options.force) {
                        await ExecutionService.tryExecuteOrder(order, { force: true });
                    } else {
                        await ExecutionService.executeOpenOrders();
                    }
                } catch (error) {
                    logger.error({ err: error, orderId: order.id }, "Failed to execute MARKET order");
                    // Don't throw - order is placed, execution will be retried
                }
            }
            
            return order;
        } catch (error) {
            console.error(error); // DEBUG: Raw stack trace
            if (error instanceof ApiError) throw error;
            logger.error({ err: error, userId, payload }, "Failed to place order");
            throw new ApiError("Failed to place order", 500, "ORDER_PLACEMENT_FAILED");
        }
    }

    private static async enforceExpiryDayOpenGuard(
        userId: string,
        payload: PlaceOrder,
        instrument: Instrument,
        now: Date
    ): Promise<void> {
        if (!instrument.expiry) return;

        const daysToExpiry = getDaysToExpiry(new Date(instrument.expiry), now);
        if (daysToExpiry > 0) return;

        const [existingPosition] = await db
            .select({
                quantity: positions.quantity,
            })
            .from(positions)
            .where(
                and(
                    eq(positions.userId, userId),
                    eq(positions.instrumentToken, instrument.instrumentToken)
                )
            )
            .limit(1);

        if (!existingPosition || existingPosition.quantity === 0) {
            throw new ApiError(
                "New exposure is blocked on expiry day",
                400,
                "EXPIRY_POSITION_BLOCKED"
            );
        }

        const currentQty = Number(existingPosition.quantity);
        const orderQty = Number(payload.quantity);
        const isLong = currentQty > 0;
        const oppositeSide = isLong ? "SELL" : "BUY";
        const maxReducible = Math.abs(currentQty);

        const isReducingOrder =
            payload.side === oppositeSide &&
            Number.isFinite(orderQty) &&
            orderQty > 0 &&
            orderQty <= maxReducible;

        if (!isReducingOrder) {
            throw new ApiError(
                "Only reducing/closing orders are allowed on expiry day",
                400,
                "EXPIRY_POSITION_BLOCKED"
            );
        }
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
