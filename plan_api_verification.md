# Verification Plan: API Routes Layer

## 🎯 Objective

Verify that `app/api/v1/orders/route.ts` correctly:

1.  Validates user authentication (mocks `auth()`).
2.  Parses and validates the request body using `Zod`.
3.  Calls `OrderService.placeOrder` with correct parameters.
4.  Returns appropriate HTTP responses (201 for success, 400 for errors).

## ⚠️ Constraints

- **No Running Server**: We will not spin up `next dev`.
- **No Live Upstox**: Continues to rely on `MarketSimulationService`.
- **Mocking Context**: We must simulate the request context (Auth Session, NextRequest).

## 🔌 The "Fake Server" Approach

We will create a script `scripts/verify-api-routes.ts` that acts as a harness for the route handlers.

### 1. Mocking `auth()` & Request

This is the trickiest part because `app/api/v1/orders/route.ts` imports `auth` from `@/lib/auth`.
In a simple `tsx` script, we cannot easily mock a specific import of the file we are testing unless we use a test runner like `vitest`.

**Decision:** Since we want to stick to simple scripts (Phase 1 stabilization), we will **bypass** testing the actual `route.ts` file directly for now, because testing Next.js App Router handlers in isolation without mocking imports (which `tsx` doesn't support natively) is brittle.

**Alternative**: We will create a "Simulated API Controller" in our test script that mirrors the logic of `route.ts`.

Wait, that doesn't verify the _actual_ route file.

**Better Approach**:
We can use a simple trick: `auth.ts` usually reads from env or database. If we can't mock imports, verifying the _route file itself_ is hard without Jest/Vitest.

**Re-evaluating Strategy**:
The user asked to "plan next step".
If we can't easily verify `route.ts` without a full test runner, maybe now IS the time to introduce a minimal `vitest` setup?
Or, we accept that verify `OrderService` (step 1) + visual inspection of `route.ts` (step 2) + manual testing via UI (step 3) is the path.

**Proposal**:
Let's _not_ overcomplicate with Vitest yet.
We will Verify the **Data Flow** via `curl` by running the server?
The user said "No frontend" but `app/api` IS the backend.
Running `next dev` locally is the _most reliable_ way to verify routes.

**Revised Plan**:

1.  User runs `npm run dev` in a separate terminal.
2.  We provide a `curl` (or `fetch` script) to hit `http://localhost:3000/api/v1/orders`.
3.  BUT authentication is hard with Curl (needs session cookie).

**Back to "Unit Test" Script**:
We can "import" the `POST` function from `route.ts`.
But we need to strip `auth()`.
Actually, if we look at `route.ts`, it calls `auth()`.
If we can't mock `auth()`, we can't test `POST`.

**Solution: The "Test Mode" Auth**
We can modify `lib/auth.ts` temporarily to return a mock session if `process.env.TEST_MODE === 'true'`.
This allows `scripts/verify-api-routes.ts` to run against the real `route.ts`!

### Plan Steps:

1.  **Modify `lib/auth.ts`**: Add a bypass for testing.
2.  **Create `scripts/verify-api-routes.ts`**:
    - Imports `POST` from `app/api/v1/orders/route.ts`.
    - Constructs a `NextRequest`.
    - Calls `POST(req)`.
    - Asserts response `status` and `json`.
3.  **Run & Verify**: ensuring 200 OK and data creation.

This confirms the _Route Layer_ works without a browser.
