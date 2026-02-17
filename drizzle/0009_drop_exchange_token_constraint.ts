import { sql } from "drizzle-orm";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export async function up(db: any) {
  // Drop the constraint that is causing sync failures
  await db.execute(sql`DROP INDEX IF EXISTS "uniqueExchangeToken"`);
}

export async function down(db: any) {
  // Re-add if needed (unlikely for a paper trading system)
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "uniqueExchangeToken" ON instruments (exchange, "exchangeToken")`);
}
