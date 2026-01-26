import { z } from "zod";

// Enums matching database schema
const OrderSideEnum = z.enum(["BUY", "SELL"]);
const OrderTypeEnum = z.enum(["MARKET", "LIMIT"]);
const OrderStatusEnum = z.enum(["PENDING", "OPEN", "FILLED", "CANCELLED", "REJECTED"]);

// Base order fields shared between MARKET and LIMIT orders
const BaseOrderSchema = z.object({
    symbol: z
        .string()
        .trim()
        .min(2, "Symbol must be at least 2 characters")
        .max(30, "Symbol cannot exceed 30 characters")
        .transform((val) => val.toUpperCase()),
    side: OrderSideEnum,
    quantity: z
        .number()
        .int("Quantity must be an integer")
        .positive("Quantity must be positive"),
    idempotencyKey: z.string().uuid("Invalid idempotency key format").optional(),
});

// Market order schema
const MarketOrderSchema = BaseOrderSchema.extend({
    orderType: z.literal("MARKET"),
});

// Limit order schema (requires limitPrice)
const LimitOrderSchema = BaseOrderSchema.extend({
    orderType: z.literal("LIMIT"),
    limitPrice: z
        .number()
        .positive("Limit price must be positive"),
});

// Discriminated union for MARKET vs LIMIT orders
export const PlaceOrderSchema = z.discriminatedUnion("orderType", [
    MarketOrderSchema,
    LimitOrderSchema,
]);

export type PlaceOrder = z.infer<typeof PlaceOrderSchema>;

// Cancel order schema
export const CancelOrderSchema = z.object({
    orderId: z.string().uuid("Invalid order ID format"),
});

export type CancelOrder = z.infer<typeof CancelOrderSchema>;

// Order query schema for filtering/pagination
export const OrderQuerySchema = z.object({
    status: OrderStatusEnum.optional(),
    symbol: z
        .string()
        .trim()
        .transform((val) => val.toUpperCase())
        .optional(),
    limit: z
        .number()
        .int()
        .positive()
        .max(50, "Limit cannot exceed 50")
        .default(20)
        .optional(),
    page: z
        .number()
        .int()
        .positive()
        .default(1)
        .optional(),
});

export type OrderQuery = z.infer<typeof OrderQuerySchema>;
