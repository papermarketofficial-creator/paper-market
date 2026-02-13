import { ApiError } from "@/lib/errors";
import type { Instrument } from "@/lib/db/schema";
import type { PlaceOrder } from "@/lib/validation/oms";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { UpstoxService } from "@/services/upstox.service";
import { marketSimulation } from "@/services/market-simulation.service";

/**
 * MarginService - Calculates required margin for different instrument types
 * Following backend-dev SKILL.md: Service layer contains ALL business logic
 */
export class MarginService {
    private static async resolveExecutionPrice(
        orderPayload: PlaceOrder,
        instrument: Instrument
    ): Promise<number> {
        if (orderPayload.orderType === "LIMIT") {
            return orderPayload.limitPrice;
        }

        const live = realTimeMarketService.getQuote(instrument.tradingsymbol)?.price;
        if (typeof live === "number" && Number.isFinite(live) && live > 0) {
            return live;
        }

        const quotes = await UpstoxService.getSystemQuotes([instrument.instrumentToken]);
        const upstoxPrice =
            Number(quotes[instrument.instrumentToken]) ||
            Number(quotes[instrument.instrumentToken.replace("|", ":")]) ||
            0;
        if (Number.isFinite(upstoxPrice) && upstoxPrice > 0) {
            return upstoxPrice;
        }

        const simulated = marketSimulation.getQuote(instrument.tradingsymbol)?.price || 0;
        if (Number.isFinite(simulated) && simulated > 0) {
            return simulated;
        }

        throw new ApiError(
            `Live market price unavailable for ${instrument.tradingsymbol}`,
            503,
            "MARKET_PRICE_UNAVAILABLE"
        );
    }

    /**
     * Calculate required margin based on instrument type and order details
     * 
     * @param orderPayload - Order details (quantity, side, orderType, limitPrice)
     * @param instrument - Instrument metadata from database
     * @returns Required margin amount in INR
     */
    static async calculateRequiredMargin(
        orderPayload: PlaceOrder,
        instrument: Instrument
    ): Promise<number> {
        const { quantity, side, orderType } = orderPayload;

        // Determine execution price
        const price = await this.resolveExecutionPrice(orderPayload, instrument);

        const lotSize = instrument.lotSize;

        switch (instrument.instrumentType) {
            case "EQUITY":
                // Cash segment: Full amount required (100% margin)
                return quantity * price;

            case "FUTURES": {
                // Futures: SPAN margin (simplified to 15% of notional value)
                // In production, this should use actual SPAN margin from exchange
                const notionalValue = quantity * price;
                const spanMargin = notionalValue * 0.15; // 15% SPAN margin
                return spanMargin;
            }

            case "OPTION":
                // Options margin depends on BUY vs SELL
                if (side === "BUY") {
                    // Buying options: Premium only (no margin required)
                    const premium = quantity * price * lotSize;
                    return premium;
                } else {
                    // Selling options: Premium + SPAN margin
                    const premium = quantity * price * lotSize;
                    const spanMargin = premium * 0.20; // 20% additional margin for option selling
                    return premium + spanMargin;
                }

            default:
                throw new ApiError(
                    `Unsupported instrument type: ${instrument.instrumentType}`,
                    400,
                    "INVALID_INSTRUMENT_TYPE"
                );
        }
    }

    /**
     * Calculate margin for multiple orders (batch processing)
     */
    static async calculateTotalMargin(
        orders: Array<{ payload: PlaceOrder; instrument: Instrument }>
    ): Promise<number> {
        const margins = await Promise.all(
            orders.map(({ payload, instrument }) =>
                this.calculateRequiredMargin(payload, instrument)
            )
        );
        return margins.reduce((total, margin) => total + margin, 0);
    }

    /**
     * Validate if margin requirement is reasonable (sanity check)
     * Prevents absurdly high margin requirements that might indicate calculation errors
     */
    static validateMarginRequirement(margin: number, maxAllowed: number = 10000000): boolean {
        if (margin < 0) {
            throw new ApiError("Margin cannot be negative", 500, "INVALID_MARGIN_CALCULATION");
        }
        if (margin > maxAllowed) {
            throw new ApiError(
                `Margin requirement (₹${margin}) exceeds maximum allowed (₹${maxAllowed})`,
                400,
                "MARGIN_TOO_HIGH"
            );
        }
        return true;
    }
}
