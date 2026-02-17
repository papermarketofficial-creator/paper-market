DO $$ BEGIN
    CREATE SEQUENCE IF NOT EXISTS ledger_entries_globalSequence_seq;
EXCEPTION
    WHEN duplicate_table THEN null;
END $$;--> statement-breakpoint

ALTER TABLE "ledger_entries"
    ADD COLUMN IF NOT EXISTS "globalSequence" bigint;--> statement-breakpoint

ALTER TABLE "ledger_entries"
    ALTER COLUMN "globalSequence"
    SET DEFAULT nextval('ledger_entries_globalSequence_seq');--> statement-breakpoint

UPDATE "ledger_entries"
SET "globalSequence" = nextval('ledger_entries_globalSequence_seq')
WHERE "globalSequence" IS NULL;--> statement-breakpoint

ALTER TABLE "ledger_entries"
    ALTER COLUMN "globalSequence" SET NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_globalSequence_unique"
    ON "ledger_entries" USING btree ("globalSequence" ASC);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ledger_entries_globalSequence_idx"
    ON "ledger_entries" USING btree ("globalSequence" ASC);--> statement-breakpoint

