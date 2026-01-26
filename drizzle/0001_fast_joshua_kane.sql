CREATE TYPE "public"."order_side" AS ENUM('BUY', 'SELL');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'OPEN', 'FILLED', 'CANCELLED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('MARKET', 'LIMIT');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('CREDIT', 'DEBIT', 'BLOCK', 'UNBLOCK', 'SETTLEMENT');--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"orderId" uuid NOT NULL,
	"userId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	CONSTRAINT "idempotency_keys_expires_after_created" CHECK ("idempotency_keys"."expiresAt" > "idempotency_keys"."createdAt")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orderId" uuid NOT NULL,
	"userId" text NOT NULL,
	"symbol" text NOT NULL,
	"side" "order_side" NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"executedAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trades_quantity_positive" CHECK ("trades"."quantity" > 0),
	CONSTRAINT "trades_price_positive" CHECK ("trades"."price" > 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"walletId" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"balanceBefore" numeric(15, 2) NOT NULL,
	"balanceAfter" numeric(15, 2) NOT NULL,
	"blockedBefore" numeric(15, 2) NOT NULL,
	"blockedAfter" numeric(15, 2) NOT NULL,
	"referenceType" varchar(50),
	"referenceId" uuid,
	"description" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"balance" numeric(15, 2) DEFAULT '1000000.00' NOT NULL,
	"blockedBalance" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"lastReconciled" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "createdAt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "createdAt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "updatedAt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "side" "order_side" NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "orderType" "order_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "limitPrice" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "executionPrice" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "executedAt" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rejectionReason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "idempotencyKey" text;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "realizedPnL" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_walletId_wallets_id_fk" FOREIGN KEY ("walletId") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_userId_key_unique" ON "idempotency_keys" USING btree ("userId","key");--> statement-breakpoint
CREATE INDEX "trades_userId_idx" ON "trades" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "trades_symbol_idx" ON "trades" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "trades_executedAt_idx" ON "trades" USING btree ("executedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_txn_unique_ref" ON "transactions" USING btree ("userId","type","referenceType","referenceId");--> statement-breakpoint
CREATE INDEX "orders_userId_idx" ON "orders" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "orders_symbol_idx" ON "orders" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_createdAt_idx" ON "orders" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_userId_symbol_unique" ON "positions" USING btree ("userId","symbol");--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "price";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_quantity_positive" CHECK ("orders"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_limitPrice_positive" CHECK ("orders"."limitPrice" IS NULL OR "orders"."limitPrice" > 0);--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_averagePrice_positive" CHECK ("positions"."averagePrice" > 0);