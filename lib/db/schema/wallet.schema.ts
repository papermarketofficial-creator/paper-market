import { pgTable, uuid, decimal, varchar, timestamp, text, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

// Transaction Type Enum
export const transactionTypeEnum = pgEnum('transaction_type', [
    'CREDIT',      // Add funds (position closed, profit realized)
    'DEBIT',       // Remove funds (direct debit, fees)
    'BLOCK',       // Block funds (order placed, margin reserved)
    'UNBLOCK',     // Release blocked funds (order cancelled)
    'SETTLEMENT',  // Convert BLOCK → DEBIT (order executed, funds consumed)
]);

// User Wallet (1:1 with User) - MATERIALIZED CACHE
// Design: Wallet balance is a computed snapshot derived from immutable transaction ledger
// Invariant: wallets.balance MUST always equal SUM(transactions) for that wallet
export const wallets = pgTable('wallets', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
    balance: decimal('balance', { precision: 15, scale: 2 }).notNull().default('1000000.00'), // ₹10L starting balance
    blockedBalance: decimal('blockedBalance', { precision: 15, scale: 2 }).notNull().default('0.00'),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    lastReconciled: timestamp('lastReconciled').notNull().defaultNow(), // Last ledger sync timestamp
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
});

// Transaction Ledger (IMMUTABLE SOURCE OF TRUTH)
// Design: Append-only ledger. Never update or delete. Balance is derived from this.
export const transactions = pgTable('transactions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('userId').notNull().references(() => users.id),
    walletId: uuid('walletId').notNull().references(() => wallets.id),
    type: transactionTypeEnum('type').notNull(),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),

    // Audit Trail: Capture state before and after
    balanceBefore: decimal('balanceBefore', { precision: 15, scale: 2 }).notNull(),
    balanceAfter: decimal('balanceAfter', { precision: 15, scale: 2 }).notNull(),
    blockedBefore: decimal('blockedBefore', { precision: 15, scale: 2 }).notNull(),
    blockedAfter: decimal('blockedAfter', { precision: 15, scale: 2 }).notNull(),

    // Reference to related entity (Order, Trade, Position)
    referenceType: varchar('referenceType', { length: 50 }), // ORDER, TRADE, POSITION
    referenceId: uuid('referenceId'), // ID of related entity

    description: text('description'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => ({
    // IDEMPOTENCY CONSTRAINT: Prevent duplicate transactions for same reference
    // This ensures that the same order cannot block funds twice, same trade cannot settle twice, etc.
    uniqueRef: uniqueIndex('wallet_txn_unique_ref').on(
        table.userId,
        table.type,
        table.referenceType,
        table.referenceId
    ),
}));

// Type exports for TypeScript
export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionType = typeof transactionTypeEnum.enumValues[number];
