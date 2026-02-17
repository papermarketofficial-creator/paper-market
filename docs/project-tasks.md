# Project Tasks & Roadmap

## 📌 Phase 1: Core Architecture (Foundation)

### ✅ Completed

- [x] **Database Schema**: Optimized `instruments` table with indexes (`segment`, `lastSyncedAt`).
- [x] **Sync Service**: Production-grade `instrument-sync.service.ts` using Token-Diff strategy.
- [x] **Reliability**: Implemented "Safety Breaker" (<50k abort) and correct Type Normalization (`FUT` -> `FUTURE`).
- [x] **CLI Tools**: `sync-instruments.ts` and `check-fo-instruments.ts` for operations.
- [x] **In-Memory Repository**: `InstrumentRepository` (Singleton) for O(1) lookups and Zero-Latency search.
- [x] **Search API**: `/api/v1/instruments/search` updated to use In-Memory Repository (Prefix Search < 1ms).

### 🚧 In Progress / Next Up

- [ ] **Option Chain API**: Create `/api/v1/instruments/chain/[symbol]` endpoint.
- [ ] **Contract Info API**: Create `/api/v1/instruments/[token]` endpoint.
- [ ] **Market Data Engine**: Connect generic WebSocket to `InstrumentRepository` for symbol mapping.

---

## 📌 Phase 2: Market Data & Trading Engine

### 1. Option Chain API (`/api/v1/instruments/chain/:symbol`)

- **Goal**: Return a structured Option Chain for UI.
- **Input**: Underlying Symbol (e.g. `NIFTY`).
- **Output**: JSON with `futures` (sorted by expiry) and `options` (grouped by strike/expiry).
- **Implementation**: use `instrumentRepository.getFutures()` and `getOptions()`.

### 2. Contract Info API

- **Goal**: details for a specific instrument.
- **Input**: Instrument Token.

### 3. WebSocket Integration

- **Goal**: Real-time ticks.
- **Task**: Ensure the WebSocket server uses `InstrumentRepository` to validate subscriptions.

---

## 📌 Phase 3: Frontend Integration (Future)

- [ ] **Search Component**: "Command K" style search using the new fast API.
- [ ] **Option Chain UI**: Visualization of the chain data.
- [ ] **Order Form**: Dynamic validation using instrument details (Lot size, Tick size).

---

## 📝 Notes for Developer

- **Restart Required**: After every `sync-instruments` run in production, the application server must be restarted to reload the In-Memory Repository.
- **Memory Usage**: Monitor heap usage. 100k instruments take ~150MB.
