import { db } from "@/lib/db";
import { positions, instruments, orders, type NewPosition, type Trade } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { ApiError } from "@/lib/errors";
import { eq, and } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";

type DbTransaction = any; // PgTransaction<PostgresJsQueryResultHKT, Record<string, never>, any>;

export class PositionService {
    /**
     * Update position based on a new trade.
     * Must be called within a transaction.
     */
    static async updatePosition(tx: DbTransaction, trade: Trade): Promise<void> {
        try {
            // Fetch existing position
            const [existingPosition] = await tx
                .select()
                .from(positions)
                .where(and(
                    eq(positions.userId, trade.userId),
                    eq(positions.symbol, trade.symbol)
                ))
                .limit(1);

            const tradePrice = parseFloat(trade.price);
            const tradeQuantity = trade.quantity;

            if (!existingPosition) {
                // Create new position
                const newPosition: NewPosition = {
                    userId: trade.userId,
                    symbol: trade.symbol,
                    quantity: trade.side === "BUY" ? tradeQuantity : -tradeQuantity,
                    averagePrice: tradePrice.toString(),
                    realizedPnL: "0",
                };

                await tx.insert(positions).values(newPosition);
                logger.debug({ userId: trade.userId, symbol: trade.symbol }, "Position created");
            } else {
                // Update existing position
                const currentQuantity = existingPosition.quantity;
                const currentAvgPrice = parseFloat(existingPosition.averagePrice);
                const currentRealizedPnL = parseFloat(existingPosition.realizedPnL);

                const { newQuantity, newAvgPrice, newRealizedPnL, tradeRealizedPnL } = this.calculateNewPosition(
                    currentQuantity,
                    currentAvgPrice,
                    currentRealizedPnL,
                    trade.side,
                    tradeQuantity,
                    tradePrice
                );

                // Update the Order with P&L info if this trade realized any P&L (closing/reducing)
                if (tradeRealizedPnL !== 0) {
                     // We need 'orders' table reference here. It should be imported.
                     // Assuming 'orders' is imported from "@/lib/db/schema"
                     
                     // Optimization: Run this update in parallel with position update/delete? 
                     // No, keep sequential for safety within tx.
                     await tx.update(orders)
                        .set({ 
                            realizedPnL: tradeRealizedPnL.toFixed(2),
                            averagePrice: currentAvgPrice.toFixed(2) // Store the avg entry price of the position
                        })
                        .where(eq(orders.id, trade.orderId));
                }

                if (newQuantity === 0) {
                    // Position closed, delete record
                    await tx
                        .delete(positions)
                        .where(and(
                            eq(positions.userId, trade.userId),
                            eq(positions.symbol, trade.symbol)
                        ));
                    logger.debug({ userId: trade.userId, symbol: trade.symbol, pnl: tradeRealizedPnL }, "Position closed");
                } else {
                    // Update position
                    await tx
                        .update(positions)
                        .set({
                            quantity: newQuantity,
                            averagePrice: newAvgPrice.toString(),
                            realizedPnL: newRealizedPnL.toString(),
                            updatedAt: new Date(),
                        })
                        .where(and(
                            eq(positions.userId, trade.userId),
                            eq(positions.symbol, trade.symbol)
                        ));
                    logger.debug({ userId: trade.userId, symbol: trade.symbol }, "Position updated");
                }
            }
        } catch (error) {
            logger.error({ err: error, trade }, "Failed to update position");
            throw error;
        }
    }

    /**
     * Get all positions for a user.
     */
    static async getPositions(userId: string) {
        try {
            const results = await db
                .select()
                .from(positions)
                .where(eq(positions.userId, userId));

            return results;
        } catch (error) {
            logger.error({ err: error, userId }, "Failed to get positions");
            throw error;
        }
    }

    /**
     * Get positions with Real-time PnL and Instrument Metadata.
     */
    static async getUserPositionsWithPnL(userId: string) {
        try {
            const userPositions = await db
                .select({
                    position: positions,
                    instrument: instruments
                })
                .from(positions)
                .leftJoin(instruments, eq(positions.symbol, instruments.tradingsymbol))
                .where(eq(positions.userId, userId));

            return userPositions.map(({ position, instrument }) => {
                const avgPrice = parseFloat(position.averagePrice);
                
                // Don't use marketSimulation here - let frontend handle ALL live price updates
                // Backend just provides the position structure with entryPrice
                // Frontend will update currentPrice from SSE stream
                const currentPrice = 0; // Always 0 from backend, frontend updates from live ticks

                // Calculate PnL: (Current - Avg) * SignedQuantity
                const quantity = position.quantity;
                const unrealizedPnL = 0; // Will be calculated on frontend with live prices

                // Debug logging
                console.log('Position mapping:', {
                    symbol: position.symbol,
                    averagePriceRaw: position.averagePrice,
                    avgPriceParsed: avgPrice,
                    currentPrice,
                    quantity,
                    unrealizedPnL
                });

                const mappedPosition = {
                    id: position.id,
                    symbol: position.symbol,
                    name: position.symbol, // Use symbol as name for now
                    quantity: Math.abs(quantity), // Frontend expects absolute
                    side: quantity > 0 ? "BUY" : "SELL" as "BUY" | "SELL",
                    entryPrice: avgPrice, // Map averagePrice to entryPrice for UI
                    averagePrice: avgPrice, // Keep for compatibility
                    currentPrice: currentPrice,
                    currentPnL: unrealizedPnL, // Map to currentPnL for UI
                    unrealizedPnL: unrealizedPnL,
                    realizedPnL: parseFloat(position.realizedPnL || "0"),
                    instrument: instrument?.instrumentType || "equity",
                    expiryDate: instrument?.expiry || null,
                    productType: "NRML" as const, // Default for now
                    lotSize: instrument?.lotSize || 1,
                    leverage: 1, // Default
                    timestamp: position.createdAt || new Date()
                };

                console.log('Mapped position:', mappedPosition);
                return mappedPosition;
            });
        } catch (error) {
            logger.error({ err: error, userId }, "Failed to get positions with PnL");
            throw error;
        }
    }

    /**
     * Calculate new position after a trade.
     * Handles weighted average pricing and realized P&L.
     */
    private static calculateNewPosition(
        currentQuantity: number,
        currentAvgPrice: number,
        currentRealizedPnL: number,
        tradeSide: "BUY" | "SELL",
        tradeQuantity: number,
        tradePrice: number
    ): { newQuantity: number; newAvgPrice: number; newRealizedPnL: number; tradeRealizedPnL: number } {
        const tradeQtyDelta = tradeSide === "BUY" ? tradeQuantity : -tradeQuantity;
        const newQuantity = currentQuantity + tradeQtyDelta;

        let newAvgPrice = currentAvgPrice;
        let newRealizedPnL = currentRealizedPnL;
        let tradeRealizedPnL = 0;

        // Determine if this trade increases or decreases position
        const isIncreasing = (currentQuantity >= 0 && tradeSide === "BUY") ||
            (currentQuantity < 0 && tradeSide === "SELL");

        if (isIncreasing) {
            // Increasing position: recalculate weighted average
            const totalCost = Math.abs(currentQuantity) * currentAvgPrice + tradeQuantity * tradePrice;
            const totalQuantity = Math.abs(currentQuantity) + tradeQuantity;
            newAvgPrice = totalCost / totalQuantity;
        } else {
            // Decreasing position: realize P&L
            const closedQuantity = Math.min(Math.abs(currentQuantity), tradeQuantity);
            const pnlPerUnit = tradeSide === "BUY"
                ? currentAvgPrice - tradePrice  // Closing short: profit if buy price < avg price
                : tradePrice - currentAvgPrice; // Closing long: profit if sell price > avg price

            const realizedPnLDelta = pnlPerUnit * closedQuantity;
            newRealizedPnL += realizedPnLDelta;
            tradeRealizedPnL = realizedPnLDelta;

            // If reversing position (going from long to short or vice versa)
            if (Math.abs(newQuantity) > 0 && Math.sign(newQuantity) !== Math.sign(currentQuantity)) {
                newAvgPrice = tradePrice; // New position starts at trade price
            }
        }

        // Round to 2 decimal places
        newAvgPrice = Math.round(newAvgPrice * 100) / 100;
        newRealizedPnL = Math.round(newRealizedPnL * 100) / 100;
        tradeRealizedPnL = Math.round(tradeRealizedPnL * 100) / 100;

        return { newQuantity, newAvgPrice, newRealizedPnL, tradeRealizedPnL };
    }

    /**
     * Close a position (full or partial) by creating an opposite order.
     * For paper trading simplicity, we'll only support full close.
     */
    static async closePosition(
        userId: string,
        positionId: string,
        quantity?: number
    ) {
        try {
            // Get the position
            const [position] = await db
                .select()
                .from(positions)
                .where(and(
                    eq(positions.id, positionId),
                    eq(positions.userId, userId)
                ))
                .limit(1);

            if (!position) {
                throw new ApiError("Position not found", 404, "POSITION_NOT_FOUND");
            }

            // Get instrument for validation
            const [instrument] = await db
                .select()
                .from(instruments)
                .where(eq(instruments.tradingsymbol, position.symbol))
                .limit(1);

            if (!instrument) {
                throw new ApiError("Instrument not found", 404, "INSTRUMENT_NOT_FOUND");
            }

            // Determine close quantity (full close for paper trading)
            const closeQuantity = quantity || Math.abs(position.quantity);
            
            // Validate quantity
            if (closeQuantity > Math.abs(position.quantity)) {
                throw new ApiError(
                    `Cannot close ${closeQuantity} units. Position only has ${Math.abs(position.quantity)} units.`,
                    400,
                    "INVALID_QUANTITY"
                );
            }

            // Create opposite order (BUY position → SELL order, SELL position → BUY order)
            const oppositeSide: "BUY" | "SELL" = position.quantity > 0 ? "SELL" : "BUY";

            // Import OrderService to place the closing order
            const { OrderService } = await import("@/services/order.service");
            
            const closeOrder = await OrderService.placeOrder(userId, {
                symbol: position.symbol,
                side: oppositeSide,
                quantity: closeQuantity,
                orderType: "MARKET", // Always use MARKET for closing
            });

            logger.info({ 
                userId, 
                positionId, 
                symbol: position.symbol, 
                closeQuantity,
                orderId: closeOrder.id 
            }, "Position close order placed");

            return {
                orderId: closeOrder.id,
                positionId: position.id,
                symbol: position.symbol,
                closedQuantity: closeQuantity,
                side: oppositeSide
            };
        } catch (error) {
            if (error instanceof ApiError) throw error;
            logger.error({ err: error, userId, positionId }, "Failed to close position");
            throw new ApiError("Failed to close position", 500, "POSITION_CLOSE_FAILED");
        }
    }
}
