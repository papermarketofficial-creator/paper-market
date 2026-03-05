ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "exitReason" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_userId_idempotency_idx" ON "orders" USING btree ("userId","idempotencyKey");--> statement-breakpoint
