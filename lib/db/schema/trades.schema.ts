
import { pgTable, serial, text, timestamp, integer, numeric } from 'drizzle-orm/pg-core';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { users } from './users.schema';

export const orders = pgTable('orders', {
    id: serial('id').primaryKey(),
    userId: text('userId').references(() => users.id).notNull(),
    symbol: text('symbol').notNull(),
    type: text('type').notNull(), // 'BUY' or 'SELL'
    quantity: integer('quantity').notNull(),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    status: text('status').notNull().default('PENDING'), // 'PENDING', 'FILLED', 'CANCELLED'
    createdAt: timestamp('createdAt').defaultNow(),
});

export const positions = pgTable('positions', {
    id: serial('id').primaryKey(),
    userId: text('userId').references(() => users.id).notNull(),
    symbol: text('symbol').notNull(),
    quantity: integer('quantity').notNull(),
    averagePrice: numeric('averagePrice', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow(),
});

export type Order = InferSelectModel<typeof orders>;
export type NewOrder = InferInsertModel<typeof orders>;
export type Position = InferSelectModel<typeof positions>;
export type NewPosition = InferInsertModel<typeof positions>;
