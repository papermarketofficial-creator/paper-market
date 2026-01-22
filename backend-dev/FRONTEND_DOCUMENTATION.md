# Paper Market Pro - Comprehensive Frontend Documentation & Backend Specification

## 1. Executive Summary
**Paper Market Pro** is a high-fidelity paper trading platform simulating the Indian Stock Market (NSE/BSE). This document provides a **deep-dive technical analysis** of the frontend to serve as a **blueprint for the backend** development.

**Current State**: Next.js 14 Frontend + Zustand (Client Logic).
**Goal**: Migrate Simulation & State logic to a robust Backend (Node.js/Go/Python) with Real-Time Data.

---

## 2. Data Models (Types & Interfaces)

The backend must replicate these exact data structures to ensure frontend compatibility.

### 2.1. Order Model (`Trade`)
This represents an instruction to buy/sell. It exists before and after execution.

```typescript
// Backend Model Suggestion: SQL Table 'orders'
interface Trade {
  id: string;              // UUID
  user_id: string;         // Foreign Key -> Users table
  symbol: string;          // e.g., "NIFTY24JAN21500CE"
  side: 'BUY' | 'SELL';
  quantity: number;        // Total quantity (Lots * LotSize)
  filledQuantity: number;  // For partial fills (Phase 2 feature)
  orderType: 'MARKET' | 'LIMIT' | 'STOP';
  status: 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  
  // Price Fields
  entryPrice: number;      // Limit Price for LIMIT orders, Execution Price for MARKET
  triggerPrice?: number;   // For STOPLOSS orders
  
  // Risk Management
  stopLoss?: number;       // Client-side SL trigger
  target?: number;         // Client-side Target trigger
  productType: 'NRML' | 'MIS'; // CNC vs Intraday

  // Audit
  entryTime: Date;
  updatedAt: Date;
}
```

### 2.2. Position Model
This represents an *active* holding in the market.

```typescript
// Backend Model Suggestion: SQL Table 'positions'
interface Position {
  id: string;              // UUID
  order_id: string;        // Link to the order that created this
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;        // Current open quantity
  averagePrice: number;    // Weighted Average Price
  currentPrice: number;    // Last Traded Price (Real-time)
  
  // PnL Metrics
  unrealizedPnL: number;   // (LTP - AvgPrice) * Qty
  realizedPnL: number;     // PnL booked from partial exits
  
  // Metadata
  productType: 'NRML' | 'MIS';
  instrument: 'equity' | 'futures' | 'options';
  lotSize: number;         // e.g., 50 for NIFTY
  expiryDate?: Date;       // For auto-expiry processing
}
```

### 2.3. Journal Entry
This represents the *historical performance* of a completed trade.

```typescript
// Backend Model Suggestion: SQL Table 'journal_entries'
interface JournalEntry {
  id: string;
  trade_id: string;
  symbol: string;
  entryTime: Date;
  exitTime: Date;
  
  // Financials
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  grossPnL: number;        // Raw Profit
  netPnL: number;          // Profit - Brokerage/Taxes (Future feature)
  
  // Analysis (User Input)
  whyEntered?: string;
  whatWentWrong?: string;
  tags?: string[];         // e.g., "Revenge Trading", "Perfect Setup"
}
```

---

## 3. Core Business Logic (Backend to Implement)

The following logic currently lives in `lib/` and `stores/` but **must move to the Backend**.

### 3.1. Order Matching Engine
The backend must replace `tradeExecution.store.ts -> processTick()`.

*   **Logic**:
    1.  Maintain a **Order Book** (or simple list) of Open Orders in Redis/Memory.
    2.  Subscribe to **Tick Data** (WebSocket).
    3.  On every Tick (`LTP` update):
        *   **Buy Limit**: Execute if `LTP <= LimitPrice`.
        *   **Sell Limit**: Execute if `LTP >= LimitPrice`.
        *   **Stop Loss**: Trigger Market Order if `LTP` crosses `TriggerPrice`.

### 3.2. Option Greeks & Payoff
*   **Current**: `lib/fno-utils.ts` calculates simplistic Max Profit/Loss.
*   **Backend**: Should calculate **IV (Implied Volatility), Delta, Theta, Gamma, Vega** using a library (e.g., standard Black-Scholes model) to provide professional analytics on the Option Chain.

### 3.3. Expiry Management
*   **Current**: `lib/expiry-utils.ts` checks user's local system time.
*   **Backend**: reliably run a **CRON Job** at 3:30 PM IST (Market Close) daily.
    *   **Action**: `settleExpiredPositions()`.
    *   **Logic**: Finds all positions with `expiryDate < NOW`.
    *   **Settlement**: Closes them at the `Closing Price` of the underlying asset.

---

## 4. API Specification Proposal (JSON Contracts)

### 4.1. Place Order
**Endpoint**: `POST /api/v1/orders`

**Request Payload**:
```json
{
  "symbol": "NIFTY24JAN21500CE",
  "side": "BUY",
  "quantity": 50,
  "orderType": "LIMIT",
  "price": 120.50,
  "productType": "NRML",
  "instrument": "options"
}
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "orderId": "ord_123456789",
    "status": "OPEN",
    "message": "Order placed successfully"
  }
}
```

### 4.2. Get Option Chain
**Endpoint**: `GET /api/v1/market/option-chain?symbol=NIFTY`

**Response**:
```json
{
  "underlyingPrice": 21500.45,
  "expiry": "24JAN2024",
  "strikes": [
    {
      "strike": 21500,
      "ce": { "symbol": "NIFTY24JAN21500CE", "ltp": 120.0, "oi": 5000000, "iv": 14.5 },
      "pe": { "symbol": "NIFTY24JAN21500PE", "ltp": 98.0, "oi": 4000000, "iv": 15.2 }
    }
    // ... more strikes
  ]
}
```

---

## 5. Frontend-Backend Integration Points

| Frontend Component | Action | Backend API Needed |
| :--- | :--- | :--- |
| `TradingForm.tsx` | Click "Buy" | `POST /api/orders` |
| `TradingForm.tsx` | Search Symbol | `GET /api/market/search?q=Rel` |
| `OptionsChain.tsx` | Load Page | `GET /api/market/option-chain` |
| `PositionsPanel.tsx` | Real-time PnL | `WS /socket.io/positions` (Push updates) |
| `JournalPage.tsx` | Load History | `GET /api/journal/entries` |

---

## 6. Migration Roadmap

1.  **Database & Auth**: Set up PostgreSQL and NextAuth (Database Adapter).
2.  **Order API**: Implement `POST /orders` that writes to DB instead of Zustand.
3.  **Real Data**: Connect to a vendor API (e.g., Kite Connect / proprietary) to populate the Option Chain.
4.  **WebSocket**: Replace `setInterval` in `market.store.ts` with a `socket.on('tick')` listener.

## 7. Package.json Version Check
**Next.js Version**: `"15.1.3"`
This is a **valid, stable, and very recent** release of Next.js 15.
*   **Pros**: Access to latest App Router improvements and Turbopack stability.
*   **Note**: Ensure your `react` and `react-dom` versions are compatible (v19rc or v18 depending on Next.js sub-version requirements, usually v19 is paired with Next 15).
