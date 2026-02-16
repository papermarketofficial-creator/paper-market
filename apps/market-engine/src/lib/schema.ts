import { pgTable, text, timestamp, integer, numeric, boolean, uniqueIndex, index, uuid, unique } from 'drizzle-orm/pg-core';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

// ═══════════════════════════════════════════════════════════
// 📊 INSTRUMENTS TABLE
// ═══════════════════════════════════════════════════════════
export const instruments = pgTable('instruments', {
    instrumentToken: text('instrumentToken').primaryKey(), // Upstox Token
    exchangeToken: text('exchangeToken').notNull(),
    tradingsymbol: text('tradingsymbol').notNull(),
    name: text('name').notNull(),
    expiry: timestamp('expiry'),
    strike: numeric('strike', { precision: 10, scale: 2 }),
    tickSize: numeric('tickSize', { precision: 8, scale: 4 }).notNull().default('0.05'),
    lotSize: integer('lotSize').notNull().default(1),
    instrumentType: text('instrumentType').notNull(),
    segment: text('segment').notNull(),
    exchange: text('exchange').notNull(),
    isActive: boolean('isActive').notNull().default(true),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').defaultNow(),
}, (t) => {
    return {
        uniqueExchangeToken: uniqueIndex('uniqueExchangeToken').on(t.exchange, t.exchangeToken),
        idxSymbol: index('idxInstrumentsSymbol').on(t.tradingsymbol),
        idxName: index('idxInstrumentsName').on(t.name),
        idxExpiry: index('idxInstrumentsExpiry').on(t.expiry),
        idxSegment: index('idxInstrumentsSegment').on(t.segment),
    }
});

// ═══════════════════════════════════════════════════════════
// 🔐 UPSTOX TOKENS TABLE
// ═══════════════════════════════════════════════════════════
// Minimal user schema for foreign key (we only need the ID)
export const users = pgTable("users", {
    id: text("id").primaryKey(),
});

export const upstoxTokens = pgTable("upstox_tokens", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("accessToken").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
    userIdUnique: unique("upstox_tokens_userId_unique").on(table.userId),
}));

// ═══════════════════════════════════════════════════════════
// 📝 TYPE EXPORTS
// ═══════════════════════════════════════════════════════════
export type Instrument = InferSelectModel<typeof instruments>;
export type NewInstrument = InferInsertModel<typeof instruments>;

export type UpstoxToken = typeof upstoxTokens.$inferSelect;
export type NewUpstoxToken = typeof upstoxTokens.$inferInsert;
