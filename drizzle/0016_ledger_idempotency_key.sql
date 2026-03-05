ALTER TABLE "ledger_entries"
    ADD COLUMN IF NOT EXISTS "idempotencyKey" text;--> statement-breakpoint

UPDATE "ledger_entries"
SET "idempotencyKey" = 'LEGACY-' || "globalSequence"::text
WHERE "idempotencyKey" IS NULL;--> statement-breakpoint

ALTER TABLE "ledger_entries"
    ALTER COLUMN "idempotencyKey" SET NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_idempotencyKey_unique"
    ON "ledger_entries" USING btree ("idempotencyKey" ASC);--> statement-breakpoint

