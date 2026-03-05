import { pgTable, text, timestamp, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { type InferSelectModel, type InferInsertModel, sql } from 'drizzle-orm';
import { users } from './users.schema';
import { instruments } from './market.schema';

// ─────────────────────────────────────────────────────────────────
// 📋 WATCHLISTS TABLE
// User-owned collections of instruments
// ─────────────────────────────────────────────────────────────────
export const watchlists = pgTable('watchlists', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isDefault: boolean('isDefault').notNull().default(false),
  maxItems: integer('maxItems').default(20), // Future-proof: soft limit
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
}, (t) => ({
  idxUserId: index('idx_watchlists_userId').on(t.userId),
  // Ensure only ONE default watchlist per user
  uniqueUserDefault: uniqueIndex('unique_user_default_watchlist')
    .on(t.userId)
    .where(sql`${t.isDefault} = true`),
}));

// ─────────────────────────────────────────────────────────────────
// 🔗 WATCHLIST_ITEMS TABLE
// Junction table: Links watchlists to instruments
// ─────────────────────────────────────────────────────────────────
export const watchlistItems = pgTable('watchlist_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  watchlistId: text('watchlistId').notNull().references(() => watchlists.id, { onDelete: 'cascade' }),
  // ✅ CRITICAL: Use instrumentToken (not tradingsymbol) for consistency
  instrumentToken: text('instrumentToken').notNull().references(() => instruments.instrumentToken, { onDelete: 'cascade' }),
  addedAt: timestamp('addedAt').defaultNow(),
}, (t) => ({
  // Prevent duplicate instruments in same watchlist
  uniqueWatchlistInstrument: uniqueIndex('unique_watchlist_instrument')
    .on(t.watchlistId, t.instrumentToken),
  idxWatchlistId: index('idx_watchlist_items_watchlistId').on(t.watchlistId),
}));

// ─────────────────────────────────────────────────────────────────
// 📊 TYPE EXPORTS
// ─────────────────────────────────────────────────────────────────
export type Watchlist = InferSelectModel<typeof watchlists>;
export type NewWatchlist = InferInsertModel<typeof watchlists>;

export type WatchlistItem = InferSelectModel<typeof watchlistItems>;
export type NewWatchlistItem = InferInsertModel<typeof watchlistItems>;
