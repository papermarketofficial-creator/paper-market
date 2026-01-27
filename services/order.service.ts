import { db } from "@/lib/db";
import { orders, trades, positions, idempotencyKeys, instruments, type NewOrder } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/errors";
import { eq, and, sql, ilike } from "drizzle-orm";
import type { PlaceOrder, OrderQuery } from "@/lib/validation/oms";
import { WalletService } from "@/services/wallet.service";
import { MarginService } from "@/services/margin.service";

export class OrderService {
    /**
     * Place a new order with idempotency support.
     */
    static async placeOrder(userId: string, payload: PlaceOrder) {
        try {
            // Check idempotency key if provided
            if (payload.idempotencyKey) {
                const existing = await this.checkIdempotencyKey(userId, payload.idempotencyKey);
                if (existing) {
                    logger.info({ orderId: existing.id, userId }, "Returning existing order (idempotent)");
                    return existing;
                }
            }

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

            // Check if user has sufficient balance
            const hasMargin = await WalletService.checkMargin(userId, requiredMargin);
            if (!hasMargin) {
                const availableBalance = await WalletService.getAvailableBalance(userId);
                throw new ApiError(
                    `Insufficient balance. Available: ₹${availableBalance.toFixed(2)}, Required: ₹${requiredMargin.toFixed(2)}`,
                    400,
                    "INSUFFICIENT_FUNDS"
                );
            }

            // Create order in transaction
            const order = await db.transaction(async (tx) => {
                const newOrder: NewOrder = {
                    userId,
                    symbol: payload.symbol,
                    side: payload.side,
                    quantity: payload.quantity,
                    orderType: payload.orderType,
                    limitPrice: payload.orderType === "LIMIT" ? payload.limitPrice.toString() : null,
                    status: "OPEN", // Skip PENDING, go directly to OPEN after validation
                    idempotencyKey: payload.idempotencyKey || null,
                };

                const [createdOrder] = await tx.insert(orders).values(newOrder).returning();

                // Block funds
                // Now we have the order ID, we can safely block the funds linked to this order
                await WalletService.blockFunds(
                    userId,
                    requiredMargin,
                    createdOrder.id,
                    tx,
                    `Margin blocked for ${payload.side} ${payload.quantity} ${payload.symbol}`
                );

                // Store idempotency key mapping if provided
                if (payload.idempotencyKey) {
                    const expiresAt = new Date();
                    expiresAt.setHours(expiresAt.getHours() + 24); // 24-hour expiry

                    await tx.insert(idempotencyKeys).values({
                        key: payload.idempotencyKey,
                        orderId: createdOrder.id,
                        userId,
                        expiresAt,
                    });
                }

                return createdOrder;
            });

            logger.info({ orderId: order.id, userId, symbol: payload.symbol }, "Order placed");
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

            // Get instrument to calculate blocked amount
            const [instrument] = await db
                .select()
                .from(instruments)
                .where(ilike(instruments.tradingsymbol, order.symbol))
                .limit(1);

            if (!instrument) {
                logger.error({ orderId, symbol: order.symbol }, "Instrument not found for order cancellation");
                throw new ApiError("Instrument not found", 404, "INSTRUMENT_NOT_FOUND");
            }

            // Calculate blocked amount (same as when order was placed)
            const orderPayload: PlaceOrder = {
                symbol: order.symbol,
                side: order.side,
                quantity: order.quantity,
                orderType: order.orderType,
                limitPrice: order.limitPrice ? parseFloat(order.limitPrice) : 0,
            };
            const blockedAmount = MarginService.calculateRequiredMargin(orderPayload, instrument);

            // Cancel order and unblock funds in transaction
            const cancelledOrder = await db.transaction(async (tx) => {
                // Update order status
                const [updated] = await tx
                    .update(orders)
                    .set({
                        status: "CANCELLED",
                        updatedAt: new Date(),
                    })
                    .where(eq(orders.id, orderId))
                    .returning();

                // Unblock funds
                await WalletService.unblockFunds(
                    userId,
                    blockedAmount,
                    orderId,
                    tx,
                    `Order cancelled: ${order.symbol}`
                );

                return updated;
            });

            logger.info({ orderId, userId, unblockedAmount: blockedAmount }, "Order cancelled");
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

    /**
     * Check if idempotency key exists and is not expired.
     */
    private static async checkIdempotencyKey(userId: string, key: string) {
        const [existing] = await db
            .select({
                orderId: idempotencyKeys.orderId,
            })
            .from(idempotencyKeys)
            .where(and(
                eq(idempotencyKeys.userId, userId),
                eq(idempotencyKeys.key, key),
                sql`${idempotencyKeys.expiresAt} > NOW()`
            ))
            .limit(1);

        if (!existing) return null;

        // Fetch the order
        const [order] = await db
            .select()
            .from(orders)
            .where(eq(orders.id, existing.orderId))
            .limit(1);

        return order || null;
    }
}
