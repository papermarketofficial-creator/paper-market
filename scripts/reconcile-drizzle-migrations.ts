import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

type JournalEntry = {
  idx: number;
  when: number;
  tag: string;
  breakpoints: boolean;
};

type Journal = {
  version: string;
  dialect: string;
  entries: JournalEntry[];
};

function loadJournal(migrationsDir: string): Journal {
  const journalPath = path.join(migrationsDir, "meta", "_journal.json");
  const raw = fs.readFileSync(journalPath, "utf8");
  return JSON.parse(raw) as Journal;
}

function sqlHash(sqlContent: string): string {
  return crypto.createHash("sha256").update(sqlContent).digest("hex");
}

function readMigrationFile(migrationsDir: string, tag: string): { hash: string; content: string } {
  const migrationPath = path.join(migrationsDir, `${tag}.sql`);
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Missing migration file: ${migrationPath}`);
  }
  const content = fs.readFileSync(migrationPath, "utf8");
  return { hash: sqlHash(content), content };
}

async function ensureNonEmptyAppSchema(client: Client): Promise<void> {
  const { rows } = await client.query<{
    users_exists: boolean;
    instruments_exists: boolean;
    wallets_exists: boolean;
  }>(`
    SELECT
      to_regclass('public.users') IS NOT NULL AS users_exists,
      to_regclass('public.instruments') IS NOT NULL AS instruments_exists,
      to_regclass('public.wallets') IS NOT NULL AS wallets_exists
  `);

  const state = rows[0];
  if (!state?.users_exists || !state.instruments_exists || !state.wallets_exists) {
    throw new Error(
      "Refusing reconciliation because expected app tables are missing. " +
      "Use this script only for existing databases that already contain the baseline schema."
    );
  }
}

async function main(): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(currentFile), "..");
  const migrationsDir = path.join(repoRoot, "drizzle");
  const journal = loadJournal(migrationsDir);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await ensureNonEmptyAppSchema(client);

    await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const existing = await client.query<{ hash: string; created_at: string }>(
      `SELECT hash, created_at FROM "drizzle"."__drizzle_migrations"`
    );
    const existingByCreatedAt = new Map<number, string[]>();
    for (const row of existing.rows) {
      const createdAt = Number(row.created_at);
      if (!Number.isFinite(createdAt)) continue;
      if (!existingByCreatedAt.has(createdAt)) {
        existingByCreatedAt.set(createdAt, []);
      }
      existingByCreatedAt.get(createdAt)!.push(row.hash);
    }

    let inserted = 0;
    let skipped = 0;

    for (const entry of journal.entries) {
      const { hash } = readMigrationFile(migrationsDir, entry.tag);
      const hashesAtTimestamp = existingByCreatedAt.get(entry.when) || [];

      if (hashesAtTimestamp.includes(hash)) {
        skipped++;
        continue;
      }

      await client.query(
        `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`,
        [hash, entry.when]
      );
      inserted++;
      hashesAtTimestamp.push(hash);
      existingByCreatedAt.set(entry.when, hashesAtTimestamp);
    }

    const maxRow = await client.query<{ created_at: string }>(
      `SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`
    );
    const latestCreatedAt = Number(maxRow.rows[0]?.created_at || 0);

    console.log(
      JSON.stringify(
        {
          reconciled: true,
          inserted,
          skipped,
          latestCreatedAt,
          latestJournalEntry: journal.entries[journal.entries.length - 1]?.when ?? null,
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
