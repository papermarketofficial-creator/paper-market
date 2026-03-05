ALTER TABLE "instruments" ADD COLUMN IF NOT EXISTS "optionType" text;
--> statement-breakpoint
UPDATE "instruments"
SET "optionType" = CASE
    WHEN upper("tradingsymbol") ~ '(^|\\s)CE(\\s|$)' THEN 'CE'
    WHEN upper("tradingsymbol") ~ '(^|\\s)PE(\\s|$)' THEN 'PE'
    ELSE NULL
END
WHERE "instrumentType" = 'OPTION' AND "optionType" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idxInstrumentsOptionType" ON "instruments" ("optionType");
--> statement-breakpoint
DO $$ BEGIN
    ALTER TYPE "ledger_reference_type" ADD VALUE IF NOT EXISTS 'OPTION_PREMIUM_DEBIT';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TYPE "ledger_reference_type" ADD VALUE IF NOT EXISTS 'OPTION_PREMIUM_CREDIT';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TYPE "ledger_reference_type" ADD VALUE IF NOT EXISTS 'OPTION_MARGIN_BLOCK';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TYPE "ledger_reference_type" ADD VALUE IF NOT EXISTS 'OPTION_MARGIN_RELEASE';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TYPE "ledger_reference_type" ADD VALUE IF NOT EXISTS 'OPTION_REALIZED_PNL';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_limitPrice_positive";
--> statement-breakpoint
ALTER TABLE "orders"
ADD CONSTRAINT "orders_limitPrice_positive"
CHECK ("limitPrice" IS NULL OR "limitPrice" >= 0);
--> statement-breakpoint
ALTER TABLE "trades" DROP CONSTRAINT IF EXISTS "trades_price_positive";
--> statement-breakpoint
ALTER TABLE "trades"
ADD CONSTRAINT "trades_price_positive"
CHECK ("price" >= 0);
