# Phase-0 Status: Trading Logic Safety

## ✅ Step 1: Type & Logic Hardening (Completed)

1.  **Instrument Types**: Standardized globally to `EQUITY`, `FUTURE`, `OPTION`, `INDEX`.
    - `lib/types/instrument.types.ts` created.
    - `MarginService` updated to use these types.
    - `ExecutionService` logic aligned.

2.  **Margin Logic Fixed**:
    - **Futures**: Now uses ~15% Margin (Mock SPAN) instead of full contract value.
    - **Options**:
      - Buy = Premium.
      - Sell = Premium + Margin (Collateral Block).

3.  **Short Selling Safety**:
    - `ExecutionService` patched to **DEBIT MARGIN** on all Derivative Sells.
    - Prevents "Free Money" loop where selling a Future would credit full mock value.
    - Current behavior: Shorting drains wallet (safe default) until Position Management is built.

4.  **Verification**:
    - `scripts/test-phase0.ts` confirms correct margin calculations.
    - Safety assertions passed.

## ⏭️ Next Step (Phase-0 Step 2)

**InstrumentToken Adoption & Schema Hardening**

1.  Update `orders` table to enforce `instrumentToken`.
2.  Update `PlaceOrder` schema.
3.  Refactor `OrderService` to lookup by Token (Primary Source of Truth).
