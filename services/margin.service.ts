import { ApiError } from "@/lib/errors";
import type { Instrument } from "@/lib/db/schema";
import type { PlaceOrder } from "@/lib/validation/oms";
import { priceOracle } from "@/services/price-oracle.service";

/**
 * MarginService - Calculates required margin for different instrument types.
 * Price resolution is delegated to PriceOracle and must never fail due to feed gaps.
 */
export class MarginService {
    private static async resolveExecutionPrice(
        orderPayload: PlaceOrder,
        instrument: Instrument
    ): Promise<number> {
        if (orderPayload.orderType === "LIMIT") {
            const limitPrice = Number(orderPayload.limitPrice);
            if (Number.isFinite(limitPrice) && limitPrice > 0) {
                return limitPrice;
            }
        }

        return priceOracle.getBestPrice(instrument.instrumentToken, {
            symbolHint: instrument.tradingsymbol,
            nameHint: instrument.name,
        });
    }

    /**
     * Calculate required margin based on instrument type and order details
     */
    static async calculateRequiredMargin(
        orderPayload: PlaceOrder,
        instrument: Instrument
    ): Promise<number> {
        const { quantity, side } = orderPayload;
        const price = await this.resolveExecutionPrice(orderPayload, instrument);

        switch (instrument.instrumentType) {
            case "EQUITY":
                return quantity * price;

            case "FUTURE": {
                const notionalValue = quantity * price;
                const spanMargin = notionalValue * 0.15;
                return spanMargin;
            }

            case "OPTION":
                if (side === "BUY") {
                    return quantity * price;
                }
                {
                    const premium = quantity * price;
                    const spanMargin = premium * 0.20;
                    return premium + spanMargin;
                }

            case "INDEX":
                throw new ApiError(
                    "Indices cannot be traded directly",
                    400,
                    "INVALID_INSTRUMENT_TYPE"
                );

            default:
                throw new ApiError(
                    `Unsupported instrument type: ${instrument.instrumentType}`,
                    400,
                    "INVALID_INSTRUMENT_TYPE"
                );
        }
    }

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

    static validateMarginRequirement(margin: number, maxAllowed: number = 100000000): boolean {
        if (margin < 0) {
            throw new ApiError("Margin cannot be negative", 500, "INVALID_MARGIN_CALCULATION");
        }
        if (!Number.isFinite(margin)) {
            throw new ApiError("Margin calculation overflow", 500, "INVALID_MARGIN_CALCULATION");
        }
        if (margin > maxAllowed) {
            throw new ApiError(
                `Margin requirement (INR ${margin}) exceeds maximum allowed (INR ${maxAllowed})`,
                400,
                "MARGIN_TOO_HIGH"
            );
        }
        return true;
    }
}
