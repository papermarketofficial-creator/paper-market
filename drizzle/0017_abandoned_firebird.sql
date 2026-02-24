ALTER TABLE "instruments" ADD COLUMN IF NOT EXISTS "underlying" text;
CREATE INDEX IF NOT EXISTS "idxInstrumentsUnderlying" ON "instruments" USING btree ("underlying");
