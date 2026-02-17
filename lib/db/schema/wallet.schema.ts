import { pgTable, uuid, decimal, varchar, timestamp, text, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

// Transaction Type Enum
export const transactionTypeEnum = pgEnum('transaction_type', [
    'CREDIT',
    'DEBIT',
    'BLOCK',
    'UNBLOCK',
    'SETTLEMENT',
]);

// User Wallet (1:1 with User) - MATERIALIZED CACHE
// Design: wallets.balance is cash. wallets.equity is real-time MTM equity.
export const wallets = pgTable('wallets', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
    balance: decimal('balance', { precision: 15, scale: 2 }).notNull().default('1000000.00'),
    equity: decimal('equity', { precision: 15, scale: 2 }).notNull().default('1000000.00'),
    marginStatus: varchar('marginStatus', { length: 32 }).notNull().default('NORMAL'),
    accountState: varchar('accountState', { length: 32 }).notNull().default('NORMAL'),
    blockedBalance: decimal('blockedBalance', { precision: 15, scale: 2 }).notNull().default('0.00'),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    lastReconciled: timestamp('lastReconciled').notNull().defaultNow(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
});

// Transaction Ledger (IMMUTABLE SOURCE OF TRUTH)
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
    referenceType: varchar('referenceType', { length: 50 }),
    referenceId: uuid('referenceId'),

    description: text('description'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => ({
    // Prevent duplicate transactions for same reference
    uniqueRef: uniqueIndex('wallet_txn_unique_ref').on(
        table.userId,
        table.type,
        table.referenceType,
        table.referenceId
    ),
}));

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionType = typeof transactionTypeEnum.enumValues[number];
