ALTER TABLE "instruments" ADD COLUMN IF NOT EXISTS "previousClose" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN IF NOT EXISTS "dayChange" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN IF NOT EXISTS "dayChangePercent" numeric(10, 4) DEFAULT '0' NOT NULL;
