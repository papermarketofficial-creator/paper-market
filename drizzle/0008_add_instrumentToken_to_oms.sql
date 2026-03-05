-- Migration: Add instrumentToken to OMS tables for F&O support
-- This enables positions and orders to be uniquely identified by instrument token
-- instead of just symbol, which is critical for derivatives.

BEGIN;

-- =====================================================================
-- STEP 1: Add instrumentToken columns (nullable for migration safety)
-- =====================================================================

-- Add to orders table
ALTER TABLE orders ADD COLUMN "instrumentToken" TEXT;
ALTER TABLE orders ADD CONSTRAINT "orders_instrumentToken_fkey" 
    FOREIGN KEY ("instrumentToken") REFERENCES instruments("instrumentToken");
CREATE INDEX "orders_instrumentToken_idx" ON orders("instrumentToken");

-- Add to trades table
ALTER TABLE trades ADD COLUMN "instrumentToken" TEXT;
ALTER TABLE trades ADD CONSTRAINT "trades_instrumentToken_fkey" 
    FOREIGN KEY ("instrumentToken") REFERENCES instruments("instrumentToken");

-- Add to positions table
ALTER TABLE positions ADD COLUMN "instrumentToken" TEXT;
ALTER TABLE positions ADD CONSTRAINT "positions_instrumentToken_fkey" 
    FOREIGN KEY ("instrumentToken") REFERENCES instruments("instrumentToken");
CREATE INDEX "positions_instrumentToken_idx" ON positions("instrumentToken");

-- =====================================================================
-- STEP 2: Backfill existing equity orders/positions/trades
-- =====================================================================

-- Backfill orders
UPDATE orders o
SET "instrumentToken" = i."instrumentToken"
FROM instruments i
WHERE i."tradingsymbol" = o.symbol
  AND i."instrumentType" = 'EQUITY'
  AND i.segment = 'NSE_EQ'
  AND o."instrumentToken" IS NULL;

-- Backfill trades
UPDATE trades t
SET "instrumentToken" = i."instrumentToken"
FROM instruments i
WHERE i."tradingsymbol" = t.symbol
  AND i."instrumentType" = 'EQUITY'
  AND i.segment = 'NSE_EQ'
  AND t."instrumentToken" IS NULL;

-- Backfill positions
UPDATE positions p
SET "instrumentToken" = i."instrumentToken"
FROM instruments i
WHERE i."tradingsymbol" = p.symbol
  AND i."instrumentType" = 'EQUITY'
  AND i.segment = 'NSE_EQ'
  AND p."instrumentToken" IS NULL;

-- =====================================================================
-- STEP 3: Make instrumentToken NOT NULL after backfill
-- =====================================================================

ALTER TABLE orders ALTER COLUMN "instrumentToken" SET NOT NULL;
ALTER TABLE trades ALTER COLUMN "instrumentToken" SET NOT NULL;
ALTER TABLE positions ALTER COLUMN "instrumentToken" SET NOT NULL;

-- =====================================================================
-- STEP 4: Update positions unique constraint
-- =====================================================================

-- Drop old constraint (userId, symbol)
DROP INDEX IF EXISTS "positions_userId_symbol_unique";

-- Create new constraint (userId, instrumentToken)
CREATE UNIQUE INDEX "positions_userId_instrumentToken_unique" 
    ON positions("userId", "instrumentToken");

COMMIT;

-- =====================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- =====================================================================
-- BEGIN;
-- DROP INDEX IF EXISTS "positions_userId_instrumentToken_unique";
-- CREATE UNIQUE INDEX "positions_userId_symbol_unique" ON positions("userId", "symbol");
-- ALTER TABLE orders DROP COLUMN "instrumentToken";
-- ALTER TABLE trades DROP COLUMN "instrumentToken";
-- ALTER TABLE positions DROP COLUMN "instrumentToken";
-- COMMIT;
