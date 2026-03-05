CREATE TABLE "upstox_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "upstox_tokens_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"watchlistId" text NOT NULL,
	"instrumentToken" text NOT NULL,
	"addedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"maxItems" integer DEFAULT 20,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "idempotency_keys" CASCADE;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "userId" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "userId" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "upstox_tokens" ADD CONSTRAINT "upstox_tokens_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlistId_watchlists_id_fk" FOREIGN KEY ("watchlistId") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_instrumentToken_instruments_instrumentToken_fk" FOREIGN KEY ("instrumentToken") REFERENCES "public"."instruments"("instrumentToken") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_watchlist_instrument" ON "watchlist_items" USING btree ("watchlistId","instrumentToken");--> statement-breakpoint
CREATE INDEX "idx_watchlist_items_watchlistId" ON "watchlist_items" USING btree ("watchlistId");--> statement-breakpoint
CREATE INDEX "idx_watchlists_userId" ON "watchlists" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_default_watchlist" ON "watchlists" USING btree ("userId") WHERE "watchlists"."isDefault" = true;