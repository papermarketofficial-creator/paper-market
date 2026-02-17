DO $$ BEGIN
    CREATE TYPE "ledger_account_type" AS ENUM ('CASH', 'MARGIN_BLOCKED', 'UNREALIZED_PNL', 'REALIZED_PNL', 'FEES');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
    CREATE TYPE "ledger_reference_type" AS ENUM ('TRADE', 'ORDER', 'LIQUIDATION', 'EXPIRY', 'ADJUSTMENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ledger_accounts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "userId" text NOT NULL,
    "accountType" "ledger_account_type" NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "ledger_accounts"
    ADD CONSTRAINT "ledger_accounts_userId_users_id_fk"
    FOREIGN KEY ("userId") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ledger_accounts_userId_idx" ON "ledger_accounts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_accounts_accountType_idx" ON "ledger_accounts" USING btree ("accountType");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_accounts_userId_accountType_unique" ON "ledger_accounts" USING btree ("userId", "accountType");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ledger_entries" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "debitAccountId" uuid NOT NULL,
    "creditAccountId" uuid NOT NULL,
    "amount" numeric(28, 8) NOT NULL,
    "currency" varchar(3) DEFAULT 'INR' NOT NULL,
    "referenceType" "ledger_reference_type" NOT NULL,
    "referenceId" text NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_debitAccountId_ledger_accounts_id_fk"
    FOREIGN KEY ("debitAccountId") REFERENCES "public"."ledger_accounts"("id")
    ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_creditAccountId_ledger_accounts_id_fk"
    FOREIGN KEY ("creditAccountId") REFERENCES "public"."ledger_accounts"("id")
    ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ledger_entries_debit_idx" ON "ledger_entries" USING btree ("debitAccountId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_credit_idx" ON "ledger_entries" USING btree ("creditAccountId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_reference_idx" ON "ledger_entries" USING btree ("referenceType", "referenceId");--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_amount_positive"
    CHECK ("amount" > 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_no_self_transfer"
    CHECK ("debitAccountId" <> "creditAccountId");
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
