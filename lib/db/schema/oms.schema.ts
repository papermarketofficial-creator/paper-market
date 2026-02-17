import { pgTable, text, integer, numeric, timestamp, pgEnum, uuid, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { users } from './users.schema';
import { instruments } from './market.schema';

export const OrderSide = pgEnum('order_side', ['BUY', 'SELL']);
export const OrderType = pgEnum('order_type', ['MARKET', 'LIMIT']);
export const OrderStatus = pgEnum('order_status', ['PENDING', 'OPEN', 'FILLED', 'CANCELLED', 'REJECTED']);

export const orders = pgTable('orders', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('userId').notNull().references(() => users.id),
    symbol: text('symbol').notNull(),
    instrumentToken: text('instrumentToken').notNull().references(() => instruments.instrumentToken),
    side: OrderSide('side').notNull(),
    quantity: integer('quantity').notNull(),
    orderType: OrderType('orderType').notNull(),
    limitPrice: numeric('limitPrice', { precision: 10, scale: 2 }),
    status: OrderStatus('status').notNull().default('PENDING'),
    executionPrice: numeric('executionPrice', { precision: 10, scale: 2 }),
    executedAt: timestamp('executedAt'),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull(),
    rejectionReason: text('rejectionReason'),
    exitReason: text('exitReason'),
    idempotencyKey: text('idempotencyKey'),
    // New fields for tracking realized P&L on closing orders
    averagePrice: numeric('averagePrice', { precision: 10, scale: 2 }), // Entry price of the position being closed
    realizedPnL: numeric('realizedPnL', { precision: 12, scale: 2 }), // Profit/Loss for this specific order execution
}, (t) => {
    return {
        userIdIdx: index('orders_userId_idx').on(t.userId),
        symbolIdx: index('orders_symbol_idx').on(t.symbol),
        instrumentTokenIdx: index('orders_instrumentToken_idx').on(t.instrumentToken),
        statusIdx: index('orders_status_idx').on(t.status),
        createdAtIdx: index('orders_createdAt_idx').on(t.createdAt),
        idempotencyIdx: index('orders_userId_idempotency_idx').on(t.userId, t.idempotencyKey),
        quantityPositive: check('orders_quantity_positive', sql`${t.quantity} > 0`),
        limitPricePositive: check('orders_limitPrice_positive', sql`${t.limitPrice} IS NULL OR ${t.limitPrice} > 0`),
    };
});

export const trades = pgTable('trades', {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('orderId').notNull().references(() => orders.id),
    userId: text('userId').notNull().references(() => users.id),
    symbol: text('symbol').notNull(),
    instrumentToken: text('instrumentToken').references(() => instruments.instrumentToken),
    side: OrderSide('side').notNull(),
    quantity: integer('quantity').notNull(),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    executedAt: timestamp('executedAt').notNull(),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (t) => {
    return {
        userIdIdx: index('trades_userId_idx').on(t.userId),
        symbolIdx: index('trades_symbol_idx').on(t.symbol),
        executedAtIdx: index('trades_executedAt_idx').on(t.executedAt),
        quantityPositive: check('trades_quantity_positive', sql`${t.quantity} > 0`),
        pricePositive: check('trades_price_positive', sql`${t.price} > 0`),
    };
});

export const positions = pgTable('positions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('userId').notNull().references(() => users.id),
    symbol: text('symbol').notNull(), // Display Only (Legacy)
    instrumentToken: text('instrumentToken').notNull().references(() => instruments.instrumentToken),
    quantity: integer('quantity').notNull(),
    averagePrice: numeric('averagePrice', { precision: 10, scale: 2 }).notNull(),
    realizedPnL: numeric('realizedPnL', { precision: 12, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    updatedAt: timestamp('updatedAt').defaultNow().notNull(),
}, (t) => {
    return {
        // Enforce uniqueness on (UseId, InstrumentToken)
        userTokenUnique: uniqueIndex('positions_userId_instrumentToken_unique').on(t.userId, t.instrumentToken),
        instrumentTokenIdx: index('positions_instrumentToken_idx').on(t.instrumentToken),
        averagePricePositive: check('positions_averagePrice_positive', sql`${t.averagePrice} > 0`),
    };
});

export type Order = InferSelectModel<typeof orders>;
export type NewOrder = InferInsertModel<typeof orders>;

export type Trade = InferSelectModel<typeof trades>;
export type NewTrade = InferInsertModel<typeof trades>;

export type Position = InferSelectModel<typeof positions>;
export type NewPosition = InferInsertModel<typeof positions>;


