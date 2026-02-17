DO $$ BEGIN
    CREATE TYPE "write_ahead_operation_type" AS ENUM (
        'TRADE_EXECUTION',
        'LEDGER_ENTRY',
        'LIQUIDATION',
        'EXPIRY_SETTLEMENT',
        'MANUAL_ADJUSTMENT'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
    CREATE TYPE "write_ahead_status" AS ENUM ('PREPARED', 'COMMITTED', 'ABORTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "write_ahead_journal" (
    "id" bigserial PRIMARY KEY NOT NULL,
    "journalId" uuid NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "operationType" "write_ahead_operation_type" NOT NULL,
    "status" "write_ahead_status" DEFAULT 'PREPARED' NOT NULL,
    "userId" text NOT NULL,
    "referenceId" text NOT NULL,
    "payload" jsonb NOT NULL,
    "checksum" text NOT NULL,
    "committedAt" timestamp
);--> statement-breakpoint

ALTER TABLE "write_ahead_journal"
    ADD CONSTRAINT "write_ahead_journal_userId_users_id_fk"
    FOREIGN KEY ("userId") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "write_ahead_journal_journalId_unique"
    ON "write_ahead_journal" USING btree ("journalId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "write_ahead_journal_createdAt_idx"
    ON "write_ahead_journal" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "write_ahead_journal_status_idx"
    ON "write_ahead_journal" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "write_ahead_journal_userId_idx"
    ON "write_ahead_journal" USING btree ("userId");--> statement-breakpoint

