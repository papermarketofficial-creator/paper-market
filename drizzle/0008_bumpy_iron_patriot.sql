DROP INDEX "uniqueExchangeToken";--> statement-breakpoint
DROP INDEX "positions_userId_symbol_unique";--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "lastSyncedAt" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "instrumentToken" text NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "instrumentToken" text NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "instrumentToken" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_instrumentToken_instruments_instrumentToken_fk" FOREIGN KEY ("instrumentToken") REFERENCES "public"."instruments"("instrumentToken") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_instrumentToken_instruments_instrumentToken_fk" FOREIGN KEY ("instrumentToken") REFERENCES "public"."instruments"("instrumentToken") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_instrumentToken_instruments_instrumentToken_fk" FOREIGN KEY ("instrumentToken") REFERENCES "public"."instruments"("instrumentToken") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idxInstrumentsType" ON "instruments" USING btree ("instrumentType");--> statement-breakpoint
CREATE INDEX "idxInstrumentsIsActive" ON "instruments" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "idxInstrumentsLastSyncedAt" ON "instruments" USING btree ("lastSyncedAt");--> statement-breakpoint
CREATE INDEX "orders_instrumentToken_idx" ON "orders" USING btree ("instrumentToken");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_userId_instrumentToken_unique" ON "positions" USING btree ("userId","instrumentToken");--> statement-breakpoint
CREATE INDEX "positions_instrumentToken_idx" ON "positions" USING btree ("instrumentToken");