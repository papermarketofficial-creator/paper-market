ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "equity" numeric(15, 2) NOT NULL DEFAULT '1000000.00';--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "marginStatus" varchar(32) NOT NULL DEFAULT 'NORMAL';--> statement-breakpoint
UPDATE "wallets" SET "equity" = "balance";--> statement-breakpoint
