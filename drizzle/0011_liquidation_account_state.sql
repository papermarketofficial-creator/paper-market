ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "accountState" varchar(32) NOT NULL DEFAULT 'NORMAL';--> statement-breakpoint
UPDATE "wallets" SET "accountState" = "marginStatus" WHERE "accountState" IS NULL OR "accountState" = '';--> statement-breakpoint
