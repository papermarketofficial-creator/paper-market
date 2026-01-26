import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users.schema";

/**
 * Stores Upstox OAuth tokens for users.
 * One token record per user (upsert on re-authentication).
 */
export const upstoxTokens = pgTable("upstox_tokens", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("accessToken").notNull(),
    // Upstox v2 API does not provide refresh tokens - tokens are valid for 1 day
    // User must re-authenticate daily for live market data
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
    userIdUnique: unique("upstox_tokens_userId_unique").on(table.userId),
}));

export type UpstoxToken = typeof upstoxTokens.$inferSelect;
export type NewUpstoxToken = typeof upstoxTokens.$inferInsert;
