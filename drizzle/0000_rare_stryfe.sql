CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	"balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"symbol" text NOT NULL,
	"type" text NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"symbol" text NOT NULL,
	"quantity" integer NOT NULL,
	"averagePrice" numeric(10, 2) NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "instrument_sync_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"syncDate" timestamp DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"recordsProcessed" integer DEFAULT 0 NOT NULL,
	"startedAt" timestamp DEFAULT now(),
	"completedAt" timestamp,
	"errorMessage" text
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"instrumentToken" text PRIMARY KEY NOT NULL,
	"exchangeToken" text NOT NULL,
	"tradingsymbol" text NOT NULL,
	"name" text NOT NULL,
	"lastPrice" numeric(10, 2) DEFAULT '0' NOT NULL,
	"expiry" timestamp,
	"strike" numeric(10, 2),
	"tickSize" numeric(8, 4) DEFAULT '0.05' NOT NULL,
	"lotSize" integer DEFAULT 1 NOT NULL,
	"instrumentType" text NOT NULL,
	"segment" text NOT NULL,
	"exchange" text NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_compound" ON "account" USING btree ("provider","providerAccountId");--> statement-breakpoint
CREATE INDEX "idx_verification_tokens_compound" ON "verificationToken" USING btree ("identifier","token");--> statement-breakpoint
CREATE UNIQUE INDEX "uniqueExchangeToken" ON "instruments" USING btree ("exchange","exchangeToken");--> statement-breakpoint
CREATE INDEX "idxInstrumentsSymbol" ON "instruments" USING btree ("tradingsymbol");--> statement-breakpoint
CREATE INDEX "idxInstrumentsExpiry" ON "instruments" USING btree ("expiry");--> statement-breakpoint
CREATE INDEX "idxInstrumentsSegment" ON "instruments" USING btree ("segment");