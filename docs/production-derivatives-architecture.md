# Production-Grade Derivatives Architecture

## 🏛️ The "Golden Rule" of Financial Infrastructure

**Database is for cold storage (Records). RAM is for hot trading (Validation).**

In a typical web app, you query the database to check if a user exists. In a high-frequency trading system, you never touch the database during the critical path of an order.

### Why?

- **Disk I/O Latency:** A fast DB query takes 2-10ms. A complex one takes 50ms.
- **Market Volatility:** In 50ms, the price of NIFTY can move 5-10 points during a crash.
- **Slippage:** Querying the DB for every order introduces variance. 100 concurrent orders = thread blocking = missed fills.

**✅ Production Pattern:**

1.  **Sync:** Upstox -> DB (Raw Data)
2.  **Hydrate:** DB -> RAM (`InstrumentRepository`) on Startup.
3.  **Trade:** Order -> RAM Lookup (15ns) -> Validate -> Insert DB (Async).

---

## 🏗️ Core Components Implemented

### 1. The In-Memory Repository (`lib/instruments/repository.ts`)

This is the heart of your system. It loads 100k+ instruments into the V8 Heap.

- **Memory Footprint:** ~120MB for 100k objects. Trivial for Node.js (which has a 2GB default heap).
- **Data Structures:**
  - `byToken`: O(1) Map for Order validation.
  - `bySymbol`: O(1) Map for Ticks.
  - `byName`: Grouped Tree for Option Chains (e.g., `derivatives['NIFTY']`).

### 2. Zero-Latency Order Validation

When a user places an order, the flow MUST be:

```typescript
// ❌ BAD: Database Query
const instrument = await db.query("SELECT * FROM instruments WHERE token = ?");
if (!instrument) throw Error;

// ✅ GOOD: Memory Lookup
const instrument = instrumentRepository.get(token); // 0ms
if (!instrument) throw Error;
// ... check lot size, circuit limits immediately ...
```

### 3. Option Chain Strategy (Aggregates)

Do rarely run SQL aggregation queries on the `instruments` table. Instead, structure your memory layout to support chain building instantly.

---

## ⚡ Redis vs. In-Process Memory

You asked when to use Redis.

| Feature          | Use In-Process (Heap)                     | Use Redis                           |
| :--------------- | :---------------------------------------- | :---------------------------------- |
| **Instruments**  | ✅ **YES** (Static, Read-Heavy)           | ❌ No (Network hop for static data) |
| **Order Book**   | ✅ **YES** (Ultra-low latency matching)   | ❌ No                               |
| **User Margins** | ❌ No (Needs persistence across restarts) | ✅ **YES** (Shared state)           |
| **Live P&L**     | ❌ No                                     | ✅ **YES** (Pub/Sub for UI updates) |
| **LTP Cache**    | ✅ **YES** (L1 Cache)                     | ✅ **YES** (L2 Shared Cache)        |

**Verdict:** Keep Instruments in `InstrumentRepository` (Heap). Keep User Wallet/Margins in Redis + DB.

---

## ⚠️ Architectural Mistakes to Avoid

1.  **Database Dependency in Hot Path:**
    - _Mistake:_ Checking `orders` table to see if a user has open positions before allowing a new order.
    - _Fix:_ Cache `openPositions` count in Redis or local memory.

2.  **Synchronous Writes:**
    - _Mistake:_ `await db.insert(order)` before sending confirmation to UI.
    - _Fix:_ Push order to memory/queue -> Confirm UI -> Persist to DB asynchronously.

3.  **Symbol String Parsing:**
    - _Mistake:_ Parsing `NIFTY24FEB24000CE` on every tick.
    - _Fix:_ Pre-calculate metadata (`expiry`, `strike`, `root`) during Sync and store in `Instrument` object.

4.  **Over-Subscription:**
    - _Mistake:_ Subscribing to all 500 NIFTY options.
    - _Fix:_ Only subscribe to the "visible" option chain (ATM ± 10 strikes).

---

## 🔍 Required Indexes for Derivatives

We have added these critical indexes to Postgres:

1.  **`idx_instrument_token` (PK):** Instant lookups by ID.
2.  **`idx_segment`:** Fast filtering for `NSE_FO`.
3.  **`idx_name`:** Finding all 'NIFTY' contracts.
4.  **`idx_expiry`:** Finding '29-FEB-2024' contracts.
5.  **`idx_instrument_type`:** Distinguishing `FUT` vs `CE`/`PE`.
6.  **(New) `idx_active`:** Only loading active instruments.

---

## 🚀 Next Steps (Before Futures UI)

You cannot build a UI without the following API endpoints backed by the Repository:

1.  **Search API (`/api/v1/instruments/search?q=NIFTY`):**
    - Must return Futures first, then Near-Month Options.
    - Use `InstrumentRepository` memory filter, NOT SQL `LIKE %...%`.

2.  **Option Chain API (`/api/v1/instruments/chain/NIFTY`):**
    - Group by Expiry.
    - Sort by Strike.
    - Calculate "Moneyness" (ATM/OTM/ITM).

3.  **Contract Info API (`/api/v1/instruments/:token`):**
    - Return Lot Size, Tick Size, Freeze Limits (for frontend validation).

---

## 🛡️ Instrument Sync Strategy (100k+ Items)

Your sync logic is now production-grade:

1.  **Streaming:** Handles 100MB+ JSON files without crashing RAM.
2.  **Batching:** 2000 items per insert prevents DB lock contention.
3.  **Upsert:** Updates existing records instead of failing on duplicates.
4.  **Soft-Delete:** Marks missing instruments as `isActive=false` (Safe).

**Status:** The sync script is currently running and populating the `NSE_FO` segment. Once complete, you will have the foundation for a professional trading engine.
