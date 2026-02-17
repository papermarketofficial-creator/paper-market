import type { PlaceOrder } from "@/lib/validation/oms";
import type { Instrument } from "@/lib/db/schema";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getFeedLastPrice } from "@/services/feed-health.service";

type AcceptanceContext = {
    userId?: string;
};

const DEFAULT_WALLET_BALANCE = Math.max(1, Number(process.env.DEFAULT_WALLET_BALANCE ?? "1000000"));
const MAX_ORDER_NOTIONAL_RATIO = Math.max(0.0001, Number(process.env.MAX_ORDER_NOTIONAL_RATIO ?? "0.05"));
const MAX_MARKET_ORDER_NOTIONAL_RATIO = Math.max(0.0001, Number(process.env.MAX_MARKET_ORDER_NOTIONAL_RATIO ?? "0.02"));
const FAT_FINGER_LIMIT = 0.20;
const CIRCUIT_BAND_LIMIT = 0.10;
const DERIVATIVE_QTY_MULTIPLIER = 10;
const EPSILON = 0.000001;

function toNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function isDerivative(instrumentType: string): boolean {
    return instrumentType === "FUTURE" || instrumentType === "OPTION";
}

function isTickAligned(price: number, tickSize: number): boolean {
    const units = price / tickSize;
    return Math.abs(units - Math.round(units)) < EPSILON;
}

export class OrderAcceptanceService {
    static validateOrder(
        payload: PlaceOrder,
        instrument: Instrument,
        context: AcceptanceContext = {}
    ): { allowed: true } {
        const quantity = toNumber(payload.quantity, NaN);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            this.reject(
                "QUANTITY_SANITY",
                "Quantity must be positive",
                context.userId,
                instrument.instrumentToken,
                null,
                quantity,
                0
            );
        }

        if (isDerivative(instrument.instrumentType)) {
            const maxQty = Math.max(1, toNumber(instrument.lotSize, 1) * DERIVATIVE_QTY_MULTIPLIER);
            if (quantity > maxQty) {
                this.reject(
                    "QUANTITY_SANITY",
                    "Derivative quantity exceeds acceptance limit",
                    context.userId,
                    instrument.instrumentToken,
                    null,
                    quantity,
                    0
                );
            }
        }

        const ltp = getFeedLastPrice(instrument.instrumentToken);
        if (!Number.isFinite(ltp) || (ltp as number) <= 0) {
            this.reject(
                "CIRCUIT_BAND_PROTECTION",
                "Last known market price unavailable",
                context.userId,
                instrument.instrumentToken,
                null,
                quantity,
                0
            );
        }

        const referencePrice = Number(ltp);
        let orderPrice = referencePrice;
        if (payload.orderType === "LIMIT") {
            orderPrice = toNumber(payload.limitPrice, NaN);
            if (!Number.isFinite(orderPrice) || orderPrice <= 0) {
                this.reject(
                    "PRICE_TICK_VALIDATION",
                    "Limit price must be positive",
                    context.userId,
                    instrument.instrumentToken,
                    orderPrice,
                    quantity,
                    0
                );
            }

            const tickSize = Math.max(0.0001, toNumber(instrument.tickSize, 0.05));
            if (!isTickAligned(orderPrice, tickSize)) {
                this.reject(
                    "PRICE_TICK_VALIDATION",
                    "Limit price must align with tick size",
                    context.userId,
                    instrument.instrumentToken,
                    orderPrice,
                    quantity,
                    orderPrice * quantity
                );
            }

            const deviation = Math.abs(orderPrice - referencePrice) / referencePrice;
            if (deviation > FAT_FINGER_LIMIT) {
                this.reject(
                    "FAT_FINGER_PRICE",
                    "Limit price exceeds fat-finger threshold",
                    context.userId,
                    instrument.instrumentToken,
                    orderPrice,
                    quantity,
                    orderPrice * quantity
                );
            }

            if (deviation > CIRCUIT_BAND_LIMIT) {
                this.reject(
                    "CIRCUIT_BAND_PROTECTION",
                    "Limit price breaches circuit band",
                    context.userId,
                    instrument.instrumentToken,
                    orderPrice,
                    quantity,
                    orderPrice * quantity
                );
            }
        }

        const notional = orderPrice * quantity;
        const maxOrderNotional = DEFAULT_WALLET_BALANCE * MAX_ORDER_NOTIONAL_RATIO;
        if (notional > maxOrderNotional) {
            this.reject(
                "MAX_NOTIONAL_PER_ORDER",
                "Order notional exceeds acceptance cap",
                context.userId,
                instrument.instrumentToken,
                orderPrice,
                quantity,
                notional
            );
        }

        if (payload.orderType === "MARKET") {
            const maxMarketNotional = DEFAULT_WALLET_BALANCE * MAX_MARKET_ORDER_NOTIONAL_RATIO;
            if (notional > maxMarketNotional) {
                this.reject(
                    "MARKET_ORDER_NOTIONAL_GUARD",
                    "Market order notional exceeds acceptance cap",
                    context.userId,
                    instrument.instrumentToken,
                    orderPrice,
                    quantity,
                    notional
                );
            }
        }

        return { allowed: true };
    }

    private static reject(
        code:
            | "FAT_FINGER_PRICE"
            | "MAX_NOTIONAL_PER_ORDER"
            | "QUANTITY_SANITY"
            | "PRICE_TICK_VALIDATION"
            | "CIRCUIT_BAND_PROTECTION"
            | "MARKET_ORDER_NOTIONAL_GUARD",
        message: string,
        userId: string | undefined,
        instrumentToken: string,
        price: number | null,
        quantity: number,
        notional: number
    ): never {
        logger.warn(
            {
                event: "ORDER_REJECTED_AT_ACCEPTANCE",
                code,
                userId: userId || "unknown",
                instrumentToken,
                price,
                quantity,
                notional,
            },
            "ORDER_REJECTED_AT_ACCEPTANCE"
        );
        throw new ApiError(message, 400, code);
    }
}
