import { db } from "@/lib/db";
import { orders, trades, positions, instruments, type NewTrade } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/errors";
import { marketSimulation } from "@/services/market-simulation.service";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { PositionService } from "@/services/position.service";
import { WalletService } from "@/services/wallet.service";
import { MarginService } from "@/services/margin.service";
import { eq, and, ilike } from "drizzle-orm";

export class ExecutionService {
    /**
     * Execute all open orders by checking market conditions.
     * This should be called periodically (e.g., every tick).
     */
    static async executeOpenOrders(): Promise<number> {
        try {
            const openOrders = await db
                .select()
                .from(orders)
                .where(eq(orders.status, "OPEN"));

            let executedCount = 0;

            for (const order of openOrders) {
                try {
                    const executed = await this.tryExecuteOrder(order);
                    if (executed) executedCount++;
                } catch (error) {
                    logger.error(
                        { err: error, orderId: order.id },
                        "Failed to execute individual order"
                    );
                    // Continue with other orders
                }
            }

            if (executedCount > 0) {
                logger.info({ executedCount }, "Orders executed");
            }

            return executedCount;
        } catch (error) {
            logger.error({ err: error }, "Failed to execute open orders");
            throw new ApiError("Execution engine failed", 500, "EXECUTION_FAILED");
        }
    }

    /**
     * Try to execute a single order based on market conditions.
     */
    private static async tryExecuteOrder(order: typeof orders.$inferSelect): Promise<boolean> {
        // Get current market price
        // Get current market price (Priority: Real-Time > Simulation)
        let quote = realTimeMarketService.getQuote(order.symbol);
        
        if (!quote) {
            // Fallback to simulation if real-time data is unavailable
            quote = marketSimulation.getQuote(order.symbol);
        }
        if (!quote) {
            logger.debug({ orderId: order.id, symbol: order.symbol }, "No market price available");
            return false;
        }

        const marketPrice = quote.price;

        // Check if execution conditions are met
        const shouldExecute = this.shouldExecute(order, marketPrice);
        if (!shouldExecute) {
            return false;
        }

        // Execute order in transaction
        try {
            await db.transaction(async (tx) => {
                // Get instrument for margin calculation
                const [instrument] = await tx
                    .select()
                    .from(instruments)
                    .where(ilike(instruments.tradingsymbol, order.symbol))
                    .limit(1);

                if (!instrument) {
                    throw new ApiError("Instrument not found", 404, "INSTRUMENT_NOT_FOUND");
                }

                // Calculate actual execution cost
                const executionCost = marketPrice * order.quantity;

                // 1. Update order to FILLED
                await tx
                    .update(orders)
                    .set({
                        status: "FILLED",
                        executionPrice: marketPrice.toString(),
                        executedAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(eq(orders.id, order.id));

                // 2. Create trade record
                const newTrade: NewTrade = {
                    orderId: order.id,
                    userId: order.userId,
                    symbol: order.symbol,
                    side: order.side,
                    quantity: order.quantity,
                    price: marketPrice.toString(),
                    executedAt: new Date(),
                };

                const [trade] = await tx.insert(trades).values(newTrade).returning();

                // 3. Settle trade: Convert BLOCK → DEBIT (for BUY orders)
                // For SELL orders, we credit the proceeds
                if (order.side === "BUY") {
                    // Settle the blocked funds (convert BLOCK to DEBIT)
                    await WalletService.settleTrade(
                        order.userId,
                        executionCost,
                        trade.id,
                        tx,
                        `Executed BUY: ${order.quantity} ${order.symbol} @ ₹${marketPrice}`,
                        order.id // Pass orderId for exact unblocking
                    );
                } else {
                    // For SELL orders: unblock the margin and credit the sale proceeds
                    // First, calculate the margin that was blocked
                    const orderPayload = {
                        symbol: order.symbol,
                        side: order.side,
                        quantity: order.quantity,
                        orderType: order.orderType,
                        limitPrice: order.limitPrice ? parseFloat(order.limitPrice) : marketPrice,
                    };
                    const blockedMargin = MarginService.calculateRequiredMargin(orderPayload, instrument);

                    // Unblock the margin
                    await WalletService.unblockFunds(
                        order.userId,
                        blockedMargin,
                        order.id,
                        tx,
                        `Released margin for SELL execution`
                    );

                    // Credit the sale proceeds
                    await WalletService.creditProceeds(
                        order.userId,
                        executionCost,
                        trade.id,
                        tx,
                        `Executed SELL: ${order.quantity} ${order.symbol} @ ₹${marketPrice}`
                    );
                }

                // 4. Update position
                await PositionService.updatePosition(tx, trade);
            });

            logger.info(
                {
                    orderId: order.id,
                    symbol: order.symbol,
                    side: order.side,
                    quantity: order.quantity,
                    price: marketPrice,
                },
                "Order executed"
            );

            return true;

        } catch (error: any) {
            if (error.code === "INSUFFICIENT_FUNDS") {
                logger.warn({ orderId: order.id }, "Execution failed: Insufficient Funds");
                // Mark order as REJECTED
                await db.update(orders)
                    .set({
                        status: "REJECTED",
                        updatedAt: new Date()
                    })
                    .where(eq(orders.id, order.id));
                return false;
            }
            throw error; // Re-throw other errors
        }
    }

    /**
     * Determine if order should execute based on market price.
     */
    private static shouldExecute(
        order: typeof orders.$inferSelect,
        marketPrice: number
    ): boolean {
        if (order.orderType === "MARKET") {
            return true; // Market orders execute immediately
        }

        if (order.orderType === "LIMIT" && order.limitPrice) {
            const limitPrice = parseFloat(order.limitPrice);

            if (order.side === "BUY") {
                // Buy limit: execute if market price <= limit price
                return marketPrice <= limitPrice;
            } else {
                // Sell limit: execute if market price >= limit price
                return marketPrice >= limitPrice;
            }
        }

        return false;
    }
}
