import { db } from "@/lib/db";
import { positions, instruments, type NewPosition, type Trade } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { marketSimulation } from "@/services/market-simulation.service";
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

                const { newQuantity, newAvgPrice, newRealizedPnL } = this.calculateNewPosition(
                    currentQuantity,
                    currentAvgPrice,
                    currentRealizedPnL,
                    trade.side,
                    tradeQuantity,
                    tradePrice
                );

                if (newQuantity === 0) {
                    // Position closed, delete record
                    await tx
                        .delete(positions)
                        .where(and(
                            eq(positions.userId, trade.userId),
                            eq(positions.symbol, trade.symbol)
                        ));
                    logger.debug({ userId: trade.userId, symbol: trade.symbol }, "Position closed");
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
                const quote = marketSimulation.getQuote(position.symbol);
                const currentPrice = quote ? quote.price : parseFloat(position.averagePrice);

                // Calculate PnL: (Current - Avg) * SignedQuantity
                const quantity = position.quantity;
                const avgPrice = parseFloat(position.averagePrice);
                const unrealizedPnL = (currentPrice - avgPrice) * quantity;

                return {
                    id: position.id,
                    symbol: position.symbol,
                    quantity: Math.abs(quantity), // Frontend expects absolute
                    side: quantity > 0 ? "BUY" : "SELL",
                    averagePrice: position.averagePrice,
                    currentPrice: currentPrice,
                    unrealizedPnL: unrealizedPnL,
                    realizedPnL: position.realizedPnL,
                    instrument: instrument?.instrumentType || "UNKNOWN",
                    expiryDate: instrument?.expiry,
                    productType: "NRML", // Default for now
                    lotSize: instrument?.lotSize || 1,
                    leverage: 1 // Default
                };
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
    ): { newQuantity: number; newAvgPrice: number; newRealizedPnL: number } {
        const tradeQtyDelta = tradeSide === "BUY" ? tradeQuantity : -tradeQuantity;
        const newQuantity = currentQuantity + tradeQtyDelta;

        let newAvgPrice = currentAvgPrice;
        let newRealizedPnL = currentRealizedPnL;

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

            // If reversing position (going from long to short or vice versa)
            if (Math.abs(newQuantity) > 0 && Math.sign(newQuantity) !== Math.sign(currentQuantity)) {
                newAvgPrice = tradePrice; // New position starts at trade price
            }
        }

        // Round to 2 decimal places
        newAvgPrice = Math.round(newAvgPrice * 100) / 100;
        newRealizedPnL = Math.round(newRealizedPnL * 100) / 100;

        return { newQuantity, newAvgPrice, newRealizedPnL };
    }
}
