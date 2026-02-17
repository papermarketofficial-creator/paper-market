# Phase-0 Trading Safety Verification Checklist

## 1. Type Standardization

- [x] **MarginService**: Uses `FUTURE`, `OPTION`, `EQUITY` (Singular, Normalized).
- [x] **Instrument Sync**: Normalizes `FUT` -> `FUTURE`, `CE` -> `OPTION`.
- [x] **ExecutionService**: Checks `EQUITY` vs `OPTION` correctly.

## 2. Margin Logic Safety

- [x] **Equity**:
  - Buy: 100% Value Debit.
  - Sell: 100% Value Credit.
- [x] **Futures**:
  - Buy: ~15% Margin Debit. (NOT Full Value).
  - Sell: ~15% Margin Debit. (Prevents "Free Money" loop).
- [x] **Options**:
  - Buy: Premium Debit.
  - Sell: Premium Credit - Margin Debit. (Net Safer).

## 3. Simulator Behavior (Expected)

| Action             | Instrument        | Result                         | Note                                                      |
| :----------------- | :---------------- | :----------------------------- | :-------------------------------------------------------- |
| **Buy NIFTY Fut**  | NIFTY24FEBFUT     | **Debit ~1.5L**                | Correct (Span Margin)                                     |
| **Sell NIFTY Fut** | NIFTY24FEBFUT     | **Debit ~1.5L**                | Correct (Short Margin Block). Prevents printing 10L cash. |
| **Buy NIFTY CE**   | NIFTY24FEB22000CE | **Debit Premium**              | Correct                                                   |
| **Sell NIFTY CE**  | NIFTY24FEB22000CE | **Credit Prem - Debit Margin** | Correct (Net Debit usually)                               |

## 4. Next Steps (Phase-1)

1.  **Position Awareness**: Differentiate "Open" vs "Close" to release margin logic.
2.  **Schema Hardening**: Enforce `instrumentToken` in Orders table.
3.  **API**: Expose Option Chain.
