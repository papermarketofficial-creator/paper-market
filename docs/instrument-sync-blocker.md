# F&O Integration - Instrument Sync Status Report

**Date:** 2026-02-16T14:30:00+05:30  
**Status:** ⚠️ **BLOCKED - Requires Upstox Authentication**

---

## 🚨 Current Blocker

### Instrument Sync Issue

**Problem:** The Upstox public instruments CSV endpoint is returning `403 Forbidden`:

```
URL: https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz
Error: HTTP 403: Forbidden
```

**Root Cause:** Upstox has likely restricted public access to the instruments master list. This endpoint now requires authentication or has been moved.

---

## 📊 Current Database State

```
Instruments by Segment:
  NSE_EQ: 40 (37 EQUITY + 3 INDEX)
  NSE_FO: 0 ← NO F&O INSTRUMENTS

Instruments by Type:
  EQUITY: 37
  INDEX: 3
  FUTURE: 0
  OPTION: 0
```

**Status:** Only equity instruments are available. Cannot proceed with F&O trading without derivatives data.

---

## 🔧 Recommended Solutions

### Option 1: Use Upstox Authenticated API (Recommended)

The Upstox API provides an authenticated endpoint for instruments:

**Endpoint:** `GET /v2/market-quote/instruments`

**Requirements:**

- Valid Upstox access token
- API authentication headers

**Implementation:**

1. Update `UpstoxService` to add `getInstruments()` method
2. Use system token for authentication
3. Fetch all instruments via authenticated API
4. Parse and sync to database

**Pros:**

- Official API, guaranteed to work
- Includes all segments (NSE_EQ, NSE_FO, etc.)
- Real-time updates

**Cons:**

- Requires valid Upstox token
- May have rate limits

---

### Option 2: Manual CSV Upload

If API access is not available:

1. Download instruments CSV manually from Upstox dashboard
2. Place in `data/instruments.csv`
3. Run custom import script

**Pros:**

- Works without API access
- One-time setup

**Cons:**

- Manual process
- Needs periodic updates
- Not automated

---

### Option 3: Use Existing Instruments + Search API

For immediate testing:

1. Use `UpstoxService.searchInstruments()` to find specific F&O contracts
2. Manually add a few futures contracts for testing
3. Verify tick data works
4. Full sync can be done later

**Pros:**

- Can start testing immediately
- Validates market data pipeline
- Unblocks Phase 1 development

**Cons:**

- Limited instrument coverage
- Not production-ready
- Manual process

---

## 🎯 Recommended Next Steps

### Immediate Action (Option 3 - Testing Mode)

1. **Manually add test instruments:**

   ```sql
   -- Add NIFTY current month future
   INSERT INTO instruments (
       "instrumentToken", "exchangeToken", "tradingsymbol", "name",
       "expiry", "strike", "tickSize", "lotSize",
       "instrumentType", "segment", "exchange", "isActive"
   ) VALUES (
       'NSE_FO|26000', -- Example token (need real one)
       '26000',
       'NIFTY24FEB24000FUT',
       'NIFTY FEB 2024 FUT',
       '2024-02-29',
       NULL,
       '0.05',
       50,
       'FUTURE',
       'NSE_FO',
       'NSE',
       true
   );
   ```

2. **Verify tick data:**
   - Start market-engine
   - Subscribe to the test future
   - Confirm ticks are received
   - Check tick freshness (<60s)

3. **Test order flow:**
   - Place test order
   - Verify margin calculation
   - Check position creation
   - Test P&L

### Long-term Solution (Option 1 - Production)

1. **Implement authenticated instrument sync:**
   - Add `UpstoxService.getInstruments()` method
   - Use system token for auth
   - Handle pagination if needed
   - Sync all NSE_FO instruments

2. **Schedule periodic sync:**
   - Run daily at market open
   - Update expiries and strikes
   - Mark expired contracts as inactive

---

## 📝 Alternative: Check Upstox Documentation

The instruments endpoint may have moved or changed. Check:

1. **Upstox API Docs:** https://upstox.com/developer/api-documentation
2. **Instruments API:** Look for `/v2/instruments` or similar
3. **Authentication:** Confirm if public access is still available

---

## 🚦 Current Status Summary

- ✅ Phase 0 infrastructure complete
- ✅ Schema migration successful
- ✅ All services updated
- ✅ Safety guards in place
- ⚠️ **BLOCKED:** No F&O instruments in database
- ⏸️ **PAUSED:** Cannot test tick data without instruments
- ⏸️ **PAUSED:** Cannot proceed to Phase 1 UI

---

## 💡 User Decision Required

**Question:** How would you like to proceed?

**A)** Implement authenticated Upstox API sync (Option 1)

- Requires: Valid Upstox token setup
- Timeline: ~1 hour implementation
- Result: Full instrument coverage

**B)** Manual CSV import (Option 2)

- Requires: Download CSV from Upstox dashboard
- Timeline: ~30 minutes
- Result: One-time sync

**C)** Add test instruments manually (Option 3)

- Requires: Find 2-3 real instrument tokens
- Timeline: ~15 minutes
- Result: Can test immediately, limited coverage

**D)** Check Upstox docs for new endpoint

- Requires: Research current API
- Timeline: ~30 minutes
- Result: May find public endpoint

---

**Recommendation:** Start with **Option C** (test instruments) to unblock tick validation, then implement **Option A** (authenticated API) for production.

---

**Report Generated:** 2026-02-16T14:30:00+05:30  
**Next Action:** Awaiting user decision on instrument sync approach
