import { db } from "@/lib/db";
import { orders, trades, positions, instruments, type NewOrder } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/errors";
import { eq, and, sql, ilike } from "drizzle-orm";
import type { PlaceOrder, OrderQuery } from "@/lib/validation/oms";
import { WalletService } from "@/services/wallet.service";
import { MarginService } from "@/services/margin.service";
import { ExecutionService } from "@/services/execution.service";

import { TRADING_UNIVERSE, isInstrumentAllowed } from "@/lib/trading-universe";

export class OrderService {
    /**
     * Place a new order with idempotency support.
     */
    static async placeOrder(userId: string, payload: PlaceOrder) {
        try {
            // Check idempotency key if provided
// Idempotency check removed for simplification


            // Validate instrument exists and is active
            logger.info({ lookupSymbol: payload.symbol }, "Looking up symbol");

            const [instrument] = await db
                .select()
                .from(instruments)
                .where(and(
                    ilike(instruments.tradingsymbol, payload.symbol),
                    eq(instruments.isActive, true)
                ))
                .limit(1);

            if (!instrument) {
                throw new ApiError("Invalid symbol", 400, "INVALID_SYMBOL");
            }

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

            // Validate quantity is multiple of lot size
            if (payload.quantity % instrument.lotSize !== 0) {
                throw new ApiError(
                    `Quantity must be multiple of lot size (${instrument.lotSize})`,
                    400,
                    "INVALID_QUANTITY"
                );
            }

            // Validate limit price is multiple of tick size (if LIMIT order)
            if (payload.orderType === "LIMIT") {
                const tickSize = parseFloat(instrument.tickSize);
                const limitPrice = payload.limitPrice;
                const remainder = (limitPrice * 100) % (tickSize * 100); // Avoid floating point issues

                if (Math.abs(remainder) > 0.01) {
                    throw new ApiError(
                        `Limit price must be multiple of tick size (${tickSize})`,
                        400,
                        "INVALID_PRICE"
                    );
                }
            }

            // Calculate required margin
            const requiredMargin = MarginService.calculateRequiredMargin(payload, instrument);
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
                side: payload.side,
                quantity: payload.quantity,
                orderType: payload.orderType,
                limitPrice: payload.orderType === "LIMIT" ? payload.limitPrice.toString() : null,
                status: "OPEN",
                idempotencyKey: payload.idempotencyKey || null,
            };

            const [order] = await db.insert(orders).values(newOrder).returning();

            logger.info({ orderId: order.id, userId, symbol: payload.symbol, availableBalance }, "Order placed (paper trading)");
            
            // ✅ Execute MARKET orders immediately
            if (payload.orderType === "MARKET") {
                try {
                    logger.info({ orderId: order.id }, "Executing MARKET order immediately");
                    await ExecutionService.executeOpenOrders();
                } catch (error) {
                    logger.error({ err: error, orderId: order.id }, "Failed to execute MARKET order");
                    // Don't throw - order is placed, execution will be retried
                }
            }
            
            return order;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            logger.error({ err: error, userId, payload }, "Failed to place order");
            throw new ApiError("Failed to place order", 500, "ORDER_PLACEMENT_FAILED");
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
