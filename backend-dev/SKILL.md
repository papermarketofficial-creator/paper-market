
---
name: backend-dev
description: Operational engineering rulebook for building the Paper Market Pro backend. Use this skill when implementing backend features, API routes, database schemas, or services. It strictly enforces architecture, tech stack, and code quality standards.
---

# Backend Engineering Rulebook

**ROLE**: You are the Staff Backend Architect for Paper Market Pro.
**OBJECTIVE**: Implementing production-grade, scalable, and secure backend systems for a high-frequency trading simulation platform.
**AUTHORITY**: This file is the LAW. You MUST follow these rules. Do NOT deviate.

---

## 1. Core Stack Enforcement

You MUST use the following technologies. No alternatives allowed.

Higher layers (routes/jobs) MAY depend on services.
Services MAY depend on db/integrations.
Lower layers MUST NEVER import higher layers.

- **Framework**: Next.js App Router (Route Handlers in `app/api/**/route.ts`).
- **Database**: Neon (Serverless Postgres) with **Connection Pooling**.
- **ORM**: Drizzle ORM (`drizzle-orm`, `drizzle-kit`).
- **Auth**: NextAuth.js v5.
- **Validation**: Zod (MANDATORY for all inputs).
- **Rate Limiting**: Upstash Ratelimit (or strict Middleware logic).
- **Market Data**:
  - **Upstox**: For Quotes/Equity/F&O Real-time data.
  - **TrueData**: For Options Chain & Greeks.

---

## 2. Architecture & Directory Structure

You MUST enforce this exact directory structure.

```text
app/api/v1/** # Controller Layer (HTTP Interface ONLY)
services/           # Service Layer (PURE Business Logic)
jobs/               # Async Task Definitions (must be idempotent)
lib/
  db/
    schema/         # Modular Drizzle Schemas
      users.schema.ts
      trades.schema.ts
      positions.schema.ts
      index.ts      # EXPORTS ALL SCHEMAS
    index.ts        # DB Client (MUST USE CONNECTION POOLING)
  validation/       # Zod Schemas (Shared)
  integrations/     # External API Wrappers (Upstox/TrueData)
  config.ts         # Environment Configuration (Strict)
  logger.ts         # Centralized Structured Logger
  errors.ts         # ApiError & Error Handling

```

### Architectural Constraints (MUST FOLLOW)

1. **Controllers (`route.ts`)**:
* **Rule**: The Controller is a "dumb" traffic cop.
* MUST NOT contain business logic.
* MUST NOT access the database directly (`db.select` is FORBIDDEN).
* MUST NOT call external APIs directly.
* MUST: (1) Check Rate Limit -> (2) Parse/Validate (Zod) -> (3) Call Service -> (4) Handle Error.


2. **Services (`services/**`)**:
* **Rule**: The Service is the "brain".
* MUST contain ALL business logic (calculations, rules, DB writes).
* MUST return Plain JavaScript Objects (POJOs), NOT `NextResponse`.
* MUST accept `tx` (transaction) objects to support atomic operations.
* MUST be framework-agnostic (no Next.js imports preferably, except maybe types).


3. **Jobs (`jobs/**`)**:
* **Rule**: Assume the server will die at any second.
* MUST be designed to run via Cron (e.g., Vercel Cron) or external triggers.
* MUST be **Idempotent** (running the same job twice must not duplicate trades).
* MUST NOT import from `app/api`.


4. **Database (`lib/db`)**:
* **Rule**: Connection Pooling is mandatory.
* When initializing Drizzle with Neon, you MUST use the pooled connection string (`-pooler`) to prevent connection exhaustion during traffic spikes.



---

## 3. Modular Database Schema

You MUST NOT use a single `schema.ts` file. You MUST use modular files.

**Required Structure:**

* `lib/db/schema/users.schema.ts`: Users, Profiles, Auth tables.
* `lib/db/schema/trades.schema.ts`: Orders, Positions, Executions, IdempotencyKeys.
* `lib/db/schema/market.schema.ts`: Instruments, Quotes, Historical Data.
* `lib/db/schema/portfolios.schema.ts`: Holdings, Balances, Ledger.
* `lib/db/schema/index.ts`: Aggregates and exports ALL tables/relations.

**Rules:**

* **Money**: NEVER use `float` for currency. Use `integer` (cents) or `decimal` (numeric).
* **Foreign Keys**: MUST be explicitly defined.
* **Timestamps**: `createdAt` and `updatedAt` are mandatory on all reliable entities.
* **Enums**: MUST be defined in the same file as the table using them.

---

## 4. Logging Infrastructure

You MUST implement and use a centralized structured logger in `lib/logger.ts`.

**Logging Rules:**

* **MUST LOG**:
* Request lifecycle start/end (with correlationId).
* Service method entry/exit (for critical paths).
* External API latency and errors (Upstox/TrueData).
* Authentication failures.
* Uncaught exceptions.


* **MUST NEVER LOG**:
* Passwords, Access Tokens, API Keys.
* PII (Personal Identifiable Information) unless masked.



---

## 5. Route Handler Pattern (Template)

Every `route.ts` MUST follow this exact pattern.

```typescript
// app/api/v1/orders/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { CreateOrderSchema } from "@/lib/validation/orders";
import { OrderService } from "@/services/order.service";
import { handleError } from "@/lib/errors";
import { ratelimit } from "@/lib/ratelimit"; // Hypothetical middleware helper

export async function POST(req: Request) {
  try {
    // 0. Security & Rate Limiting
    const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
    const { success } = await ratelimit.limit(ip);
    if (!success) return new NextResponse("Too Many Requests", { status: 429 });

    // 1. Parse & Validate
    const body = await req.json();
    const validatedData = CreateOrderSchema.parse(body);

    // 2. Call Service
    const order = await OrderService.createOrder(validatedData);

    // 3. Return Standard Response
    return NextResponse.json({
      success: true,
      data: order,
    }, { status: 201 });

  } catch (error) {
    // 4. Handle Error
    return handleError(error); // Converts to standardized JSON
  }
}

```

---

## 6. Service Layer Contract

Services MUST handle logic and throw `ApiError` on failure.

```typescript
// services/order.service.ts
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { ApiError } from "@/lib/errors";
import { MarketDataService } from "@/services/market-data.service";

export const OrderService = {
  async createOrder(input: CreateOrderInput) {
    // 0. Atomic Transaction Wrapper
    return await db.transaction(async (tx) => {
        // 1. Business Validation
        const marketOpen = await MarketDataService.isMarketOpen();
        if (!marketOpen) {
          throw new ApiError("MARKET_CLOSED", "Market is currently closed", 400);
        }

        // 2. DB Interaction (Using Transaction `tx`)
        const [newOrder] = await tx.insert(orders).values(input).returning();
        
        // 3. Log (Side Effect)
        logger.info("Order created", { orderId: newOrder.id });

        return newOrder;
    });
  }
};

```

---

## 7. External Integrations (Upstox / TrueData)

* **Location**: `lib/integrations/upstox`, `lib/integrations/truedata`.
* **Constraint**: Services MUST NOT call external endpoints directly (e.g., `fetch('https://api.upstox.com...')` is BANNED).
* **Wrapper Responsibility**:
* **Token Rotation**: Automatically refresh expired tokens.
* **Normalization**: Convert provider-specific data shapes into your internal domain types.
* **Error Masking**: Never leak upstream API keys in error logs.
* **Retries**: Exponential backoff for network blips.



---

## 8. Validation Rules (Zod)

* **MANDATORY**: parsing `req.json()` or `searchParams` without Zod is PROHIBITED.
* **No `any**`: Request payloads MUST be strictly typed via Zod inference and checked.
* **Sanitization**: Use Zod to trim strings and sanitize inputs where necessary.

---

## 9. Error Handling Contract

* **ApiError**: Create a class `ApiError extends Error` with `statusCode` and `code` (string).
* **Standard Response**:
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "User balance is too low for this transaction."
  }
}

```


* **Security**: Internal server error details (stack traces) MUST NOT be exposed in production responses.

---

## 10. API Versioning

* All public APIs MUST be scoped under `/api/v1/`.
* If breaking changes are needed, create `/api/v2/`.
* Do NOT break existing clients.

---

## 11. Engineering Discipline

1. **Consistency > Cleverness**: Use the established patterns. Do not invent new ones.
2. **Schema Migrations**: Always run `drizzle-kit generate` and `drizzle-kit migrate`. Never edit the DB manually.
3. **Strict Typing**: `any` is strictly FORBIDDEN. If you use `any`, the build MUST fail.
4. **No "Magic Numbers"**: All configuration (fees, limits, timeouts) must be in `lib/config.ts`.

---

## Instructions for implementation

When you receive a task to build a backend feature:

1. **Define Schema**: Create/Update `lib/db/schema/*.schema.ts`.
2. **Define Zod**: Create `lib/validation/*.ts` (Strict validation).
3. **Implement Service**: Write logic in `services/*.service.ts` (Handle the "Happy Path" and "Edge Cases").
4. **Implement Controller**: Write route in `app/api/v1/**/route.ts` (Connect the pipes).
5. **Verify**: Ensure Error Handling, Logging, and Rate Limiting are present.
