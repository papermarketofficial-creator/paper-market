import { z } from "zod";

/**
 * Validation schemas for wallet operations
 * Following backend-dev SKILL.md: All inputs MUST be validated with Zod
 */

// Check if user has sufficient margin
export const CheckMarginSchema = z.object({
    userId: z.string().uuid("Invalid user ID format"),
    requiredAmount: z.number().positive("Required amount must be positive"),
});

// Block funds when order is placed
export const BlockFundsSchema = z.object({
    userId: z.string().uuid("Invalid user ID format"),
    amount: z.number().positive("Amount must be positive"),
    orderId: z.string().uuid("Invalid order ID format"),
    description: z.string().optional(),
});

// Unblock funds when order is cancelled
export const UnblockFundsSchema = z.object({
    userId: z.string().uuid("Invalid user ID format"),
    amount: z.number().positive("Amount must be positive"),
    orderId: z.string().uuid("Invalid order ID format"),
    description: z.string().optional(),
});

// Settle trade (convert BLOCK → DEBIT)
export const SettleTradeSchema = z.object({
    userId: z.string().uuid("Invalid user ID format"),
    amount: z.number().positive("Amount must be positive"),
    tradeId: z.string().uuid("Invalid trade ID format"),
    description: z.string().optional(),
});

// Credit balance when position is closed
export const CreditBalanceSchema = z.object({
    userId: z.string().uuid("Invalid user ID format"),
    amount: z.number().positive("Amount must be positive"),
    referenceType: z.enum(["ORDER", "TRADE", "POSITION"]),
    referenceId: z.string().uuid("Invalid reference ID format"),
    description: z.string().optional(),
});

// Debit balance (direct debit, fees)
export const DebitBalanceSchema = z.object({
    userId: z.string().uuid("Invalid user ID format"),
    amount: z.number().positive("Amount must be positive"),
    referenceType: z.enum(["ORDER", "TRADE", "POSITION", "FEE"]),
    referenceId: z.string().uuid().optional(),
    description: z.string().optional(),
});

// Query transaction history
export const TransactionQuerySchema = z.object({
    userId: z.string().uuid("Invalid user ID format"),
    type: z.enum(["CREDIT", "DEBIT", "BLOCK", "UNBLOCK", "SETTLEMENT"]).optional(),
    referenceType: z.enum(["ORDER", "TRADE", "POSITION"]).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    limit: z.number().int().positive().max(100).default(20),
    page: z.number().int().positive().default(1),
});

// Type exports for TypeScript inference
export type CheckMargin = z.infer<typeof CheckMarginSchema>;
export type BlockFunds = z.infer<typeof BlockFundsSchema>;
export type UnblockFunds = z.infer<typeof UnblockFundsSchema>;
export type SettleTrade = z.infer<typeof SettleTradeSchema>;
export type CreditBalance = z.infer<typeof CreditBalanceSchema>;
export type DebitBalance = z.infer<typeof DebitBalanceSchema>;
export type TransactionQuery = z.infer<typeof TransactionQuerySchema>;
