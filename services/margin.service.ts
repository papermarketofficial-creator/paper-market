import { ApiError } from "@/lib/errors";
import type { Instrument } from "@/lib/db/schema";
import type { PlaceOrder } from "@/lib/validation/oms";
import { priceOracle } from "@/services/price-oracle.service";
import { instrumentStore } from "@/stores/instrument.store";
import {
    calculateLongOptionMargin,
    calculateShortOptionMargin,
} from "@/lib/trading/option-margin";
import { calculateFuturesRequiredMargin } from "@/lib/trading/futures-margin";

/**
 * MarginService - Calculates required margin for different instrument types.
 * Price resolution is delegated to PriceOracle and must never fail due to feed gaps.
 */
export class MarginService {
    private static normalizePrice(value: unknown, fallback = 0.01): number {
        const price = Number(value);
        return Number.isFinite(price) && price > 0 ? price : fallback;
    }

    private static resolveUnderlyingToken(instrument: Instrument): string | null {
        if (!instrumentStore.isReady()) return null;
        const hint = String(instrument.name || "").trim();
        if (!hint) return null;

        const bySymbol = instrumentStore.getBySymbol(hint);
        if (bySymbol?.instrumentToken) return bySymbol.instrumentToken;

        for (const candidate of instrumentStore.getAll()) {
            if (
                (candidate.instrumentType === "INDEX" || candidate.instrumentType === "EQUITY") &&
                (candidate.tradingsymbol === hint || candidate.name === hint)
            ) {
                return candidate.instrumentToken;
            }
        }

        return null;
    }

    static async resolveOptionUnderlyingPrice(
        instrument: Instrument,
        optionPriceFallback: number
    ): Promise<number> {
        const fallback = this.normalizePrice(optionPriceFallback, 0.01);
        const underlyingToken = this.resolveUnderlyingToken(instrument);
        if (!underlyingToken) return fallback;

        try {
            return this.normalizePrice(
                await priceOracle.getBestPrice(underlyingToken, {
                    symbolHint: instrument.name,
                    nameHint: instrument.name,
                }),
                fallback
            );
        } catch {
            return fallback;
        }
    }

    static async calculateOptionShortMarginForQuantity(
        instrument: Instrument,
        quantity: number,
        optionPrice: number
    ): Promise<number> {
        const safeQty = Math.max(0, Number(quantity) || 0);
        if (safeQty === 0) return 0;

        const optionPriceSafe = this.normalizePrice(optionPrice, 0.01);
        const underlyingPrice = await this.resolveOptionUnderlyingPrice(instrument, optionPriceSafe);

        return calculateShortOptionMargin({
            optionPrice: optionPriceSafe,
            underlyingPrice,
            quantity: safeQty,
        });
    }

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
                return calculateFuturesRequiredMargin({
                    price,
                    quantity,
                    leverage: orderPayload.leverage,
                    instrument,
                });
            }

            case "OPTION":
                if (side === "BUY") {
                    return calculateLongOptionMargin(price, quantity);
                }
                return this.calculateOptionShortMarginForQuantity(instrument, quantity, price);

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
