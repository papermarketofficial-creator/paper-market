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
    static async tryExecuteOrder(order: typeof orders.$inferSelect): Promise<boolean> {
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
                // Calculate actual execution cost
                const executionCost = marketPrice * order.quantity;

                // Define newTrade before Promise.all
                const newTrade: NewTrade = {
                    orderId: order.id,
                    userId: order.userId,
                    symbol: order.symbol,
                    side: order.side,
                    quantity: order.quantity,
                    price: marketPrice.toString(),
                    executedAt: new Date(),
                };

                // Parallelize Order Update and Trade Insert
                const [_, [trade]] = await Promise.all([
                    tx.update(orders)
                        .set({
                            status: "FILLED",
                            executionPrice: marketPrice.toString(),
                            executedAt: new Date(),
                            updatedAt: new Date(),
                        })
                        .where(eq(orders.id, order.id)),
                    
                    tx.insert(trades).values(newTrade).returning()
                ]);

                // Parallelize Wallet and Position updates
                const promises = [];

                // 🎯 PAPER TRADING: Update Wallet Balance
                if (order.side === 'BUY') {
                    // DEBIT cost from wallet
                    promises.push(
                        WalletService.debitBalance(
                            order.userId,
                            executionCost,
                            'TRADE',
                            trade.id,
                            tx,
                            `Buy ${order.symbol} (${order.quantity} @ ${marketPrice})`
                        )
                    );
                } else {
                    // CREDIT proceeds to wallet (Sell)
                    promises.push(
                        WalletService.creditProceeds(
                            order.userId,
                            executionCost,
                            trade.id,
                            tx,
                            `Sell ${order.symbol} (${order.quantity} @ ${marketPrice})`
                        )
                    );
                }

                // 3. Update position
                promises.push(PositionService.updatePosition(tx, trade));

                await Promise.all(promises);
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
    static shouldExecute(
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
