# Wallet Integration - Implementation Plan

## Overview
Implement a complete wallet/balance management system to track user funds, enforce margin requirements, and maintain transaction history for the Paper Market Pro trading simulator.

---

## Phase 0: Feature Definition & Requirements

### Business Requirements
1. **Virtual Balance**: Each user starts with a configurable virtual balance (e.g., ₹10,00,000)
2. **Balance Tracking**: Real-time tracking of available vs. blocked funds
3. **Margin Management**: Block funds when orders are placed, release on cancellation
4. **Execution Settlement**: Deduct actual cost when orders execute
5. **Position Closure**: Credit proceeds when positions are closed
6. **Transaction History**: Maintain audit trail of all balance changes

### Technical Requirements
1. **Atomic Operations**: All balance updates must be transactional
2. **Idempotency**: Prevent duplicate credits/debits
3. **Validation**: Pre-trade margin checks before order placement
4. **Ledger**: Complete transaction log for reconciliation

---

## Phase 1: Database Schema Enhancement

### 1.1 Wallet Schema (`lib/db/schema/wallet.schema.ts`)

**Design Philosophy:**
- **Ledger is Source of Truth**: The `transactions` table is the immutable ledger
- **Wallet is Materialized Cache**: The `wallets` table stores computed snapshots for performance
- **Invariant**: `wallets.balance` MUST always equal `SUM(transactions)` for that wallet

**Tables to Create/Update:**

```typescript
// User Wallet (1:1 with User) - MATERIALIZED CACHE
export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  balance: decimal('balance', { precision: 15, scale: 2 }).notNull().default('1000000.00'), // ₹10L
  blockedBalance: decimal('blockedBalance', { precision: 15, scale: 2 }).notNull().default('0.00'),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  lastReconciled: timestamp('lastReconciled').notNull().defaultNow(), // Last ledger sync
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
});

// Transaction Ledger (IMMUTABLE SOURCE OF TRUTH)
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId').notNull().references(() => users.id),
  walletId: uuid('walletId').notNull().references(() => wallets.id),
  type: transactionTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  balanceBefore: decimal('balanceBefore', { precision: 15, scale: 2 }).notNull(),
  balanceAfter: decimal('balanceAfter', { precision: 15, scale: 2 }).notNull(),
  blockedBefore: decimal('blockedBefore', { precision: 15, scale: 2 }).notNull(),
  blockedAfter: decimal('blockedAfter', { precision: 15, scale: 2 }).notNull(),
  referenceType: varchar('referenceType', { length: 50 }), // ORDER, TRADE, POSITION
  referenceId: uuid('referenceId'), // ID of related entity
  description: text('description'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => ({
  // IDEMPOTENCY CONSTRAINT: Prevent duplicate transactions for same reference
  uniqueRef: uniqueIndex('wallet_txn_unique_ref').on(
    table.userId, 
    table.type, 
    table.referenceType, 
    table.referenceId
  ),
}));

export const transactionTypeEnum = pgEnum('transaction_type', [
  'CREDIT',      // Add funds (position closed, profit realized)
  'DEBIT',       // Remove funds (direct debit, fees)
  'BLOCK',       // Block funds (order placed, margin reserved)
  'UNBLOCK',     // Release blocked funds (order cancelled)
  'SETTLEMENT',  // Convert BLOCK → DEBIT (order executed, funds consumed)
]);
```

**Key Improvements:**
1. ✅ **Idempotency Enforced**: Unique constraint prevents duplicate transactions
2. ✅ **Ledger Tracking**: Added `blockedBefore`/`blockedAfter` for complete audit trail
3. ✅ **Reconciliation**: Added `lastReconciled` timestamp for integrity checks
4. ✅ **Settlement Clarity**: SETTLEMENT explicitly converts BLOCK → DEBIT

### 1.2 Migration Strategy
- Generate migration: `npx drizzle-kit generate`
- Apply migration: `npx drizzle-kit migrate`
- Seed initial wallets for existing users

---

## Phase 2: Validation Layer (Zod Schemas)

**File**: `lib/validation/wallet.ts`

```typescript
export const CheckMarginSchema = z.object({
  userId: z.string().uuid(),
  requiredAmount: z.number().positive(),
});

export const DebitBalanceSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive(),
  referenceType: z.enum(['ORDER', 'TRADE', 'POSITION']),
  referenceId: z.string().uuid(),
  description: z.string().optional(),
});

export const CreditBalanceSchema = DebitBalanceSchema;

export const BlockFundsSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive(),
  orderId: z.string().uuid(),
});
```

---

## Phase 3: Service Layer Implementation

### 3.1 Margin Service (`services/margin.service.ts`)

**Purpose**: Abstract margin calculation logic for different instrument types

```typescript
export class MarginService {
  // Calculate required margin based on instrument type
  static calculateRequiredMargin(
    orderPayload: PlaceOrder, 
    instrument: Instrument
  ): number {
    const { quantity, side, orderType } = orderPayload;
    const price = orderType === 'LIMIT' ? orderPayload.limitPrice : parseFloat(instrument.lastPrice);
    
    switch (instrument.instrumentType) {
      case 'EQUITY':
        // Cash: Full amount
        return quantity * price;
      
      case 'FUTURES':
        // Futures: SPAN margin (simplified for now)
        const spanMargin = price * quantity * 0.15; // 15% of notional
        return spanMargin;
      
      case 'OPTION':
        // Options: Premium + margin (if selling)
        if (side === 'BUY') {
          return quantity * price * instrument.lotSize; // Premium only
        } else {
          // Selling: Premium + SPAN margin
          const premium = quantity * price * instrument.lotSize;
          const margin = premium * 0.20; // 20% additional margin
          return premium + margin;
        }
      
      default:
        throw new ApiError('Unsupported instrument type', 400, 'INVALID_INSTRUMENT');
    }
  }
}
```

### 3.2 Wallet Service (`services/wallet.service.ts`)

**Core Methods:**

```typescript
export class WalletService {
  // Get or create wallet for user
  static async getWallet(userId: string, tx?: Transaction): Promise<Wallet> {
    const executor = tx || db;
    let [wallet] = await executor.select().from(wallets).where(eq(wallets.userId, userId));
    
    if (!wallet) {
      [wallet] = await executor.insert(wallets).values({ userId }).returning();
    }
    
    return wallet;
  }
  
  // Check if user has sufficient available balance
  static async checkMargin(userId: string, requiredAmount: number): Promise<boolean> {
    const wallet = await this.getWallet(userId);
    const availableBalance = parseFloat(wallet.balance) - parseFloat(wallet.blockedBalance);
    return availableBalance >= requiredAmount;
  }
  
  // Block funds when order is placed
  static async blockFunds(
    userId: string, 
    amount: number, 
    orderId: string, 
    tx: Transaction
  ): Promise<void> {
    const wallet = await this.getWallet(userId, tx);
    const availableBalance = parseFloat(wallet.balance) - parseFloat(wallet.blockedBalance);
    
    if (availableBalance < amount) {
      throw new ApiError('Insufficient balance', 400, 'INSUFFICIENT_FUNDS');
    }
    
    // Record transaction (idempotency enforced by DB constraint)
    await tx.insert(transactions).values({
      userId,
      walletId: wallet.id,
      type: 'BLOCK',
      amount: amount.toString(),
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance, // Balance unchanged
      blockedBefore: wallet.blockedBalance,
      blockedAfter: (parseFloat(wallet.blockedBalance) + amount).toString(),
      referenceType: 'ORDER',
      referenceId: orderId,
      description: `Blocked funds for order ${orderId}`,
    });
    
    // Update wallet cache
    await tx.update(wallets)
      .set({ 
        blockedBalance: (parseFloat(wallet.blockedBalance) + amount).toString(),
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, wallet.id));
  }
  
  // Release blocked funds when order is cancelled
  static async unblockFunds(
    userId: string, 
    amount: number, 
    orderId: string, 
    tx: Transaction
  ): Promise<void> {
    const wallet = await this.getWallet(userId, tx);
    
    // Validate sufficient blocked funds exist
    if (parseFloat(wallet.blockedBalance) < amount) {
      throw new ApiError('Insufficient blocked balance', 500, 'WALLET_INCONSISTENCY');
    }
    
    await tx.insert(transactions).values({
      userId,
      walletId: wallet.id,
      type: 'UNBLOCK',
      amount: amount.toString(),
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance,
      blockedBefore: wallet.blockedBalance,
      blockedAfter: (parseFloat(wallet.blockedBalance) - amount).toString(),
      referenceType: 'ORDER',
      referenceId: orderId,
      description: `Released blocked funds for cancelled order ${orderId}`,
    });
    
    await tx.update(wallets)
      .set({ 
        blockedBalance: (parseFloat(wallet.blockedBalance) - amount).toString(),
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, wallet.id));
  }
  
  // Settle trade: Convert BLOCK → DEBIT (order executed)
  static async settleTrade(
    userId: string, 
    amount: number, 
    tradeId: string, 
    tx: Transaction
  ): Promise<void> {
    const wallet = await this.getWallet(userId, tx);
    
    // CRITICAL: Validate sufficient blocked funds exist
    if (parseFloat(wallet.blockedBalance) < amount) {
      throw new ApiError(
        'Settlement failed: insufficient blocked balance', 
        500, 
        'WALLET_INCONSISTENCY'
      );
    }
    
    // SETTLEMENT = decrease both balance AND blockedBalance
    await tx.insert(transactions).values({
      userId,
      walletId: wallet.id,
      type: 'SETTLEMENT',
      amount: amount.toString(),
      balanceBefore: wallet.balance,
      balanceAfter: (parseFloat(wallet.balance) - amount).toString(),
      blockedBefore: wallet.blockedBalance,
      blockedAfter: (parseFloat(wallet.blockedBalance) - amount).toString(),
      referenceType: 'TRADE',
      referenceId: tradeId,
      description: `Settlement for trade ${tradeId}`,
    });
    
    await tx.update(wallets)
      .set({ 
        balance: (parseFloat(wallet.balance) - amount).toString(),
        blockedBalance: (parseFloat(wallet.blockedBalance) - amount).toString(),
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, wallet.id));
  }
  
  // Credit balance when position is closed
  static async creditProceeds(
    userId: string, 
    amount: number, 
    positionId: string, 
    tx: Transaction
  ): Promise<void> {
    const wallet = await this.getWallet(userId, tx);
    
    await tx.insert(transactions).values({
      userId,
      walletId: wallet.id,
      type: 'CREDIT',
      amount: amount.toString(),
      balanceBefore: wallet.balance,
      balanceAfter: (parseFloat(wallet.balance) + amount).toString(),
      blockedBefore: wallet.blockedBalance,
      blockedAfter: wallet.blockedBalance,
      referenceType: 'POSITION',
      referenceId: positionId,
      description: `Proceeds from closing position ${positionId}`,
    });
    
    await tx.update(wallets)
      .set({ 
        balance: (parseFloat(wallet.balance) + amount).toString(),
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, wallet.id));
  }
  
  // Recalculate wallet from ledger (admin recovery tool)
  static async recalculateFromLedger(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const wallet = await this.getWallet(userId, tx);
      
      // Compute balance from ledger
      const ledger = await tx.select().from(transactions)
        .where(eq(transactions.userId, userId))
        .orderBy(asc(transactions.createdAt));
      
      let computedBalance = 1000000; // Initial balance
      let computedBlocked = 0;
      
      for (const txn of ledger) {
        const amount = parseFloat(txn.amount);
        
        switch (txn.type) {
          case 'CREDIT':
            computedBalance += amount;
            break;
          case 'DEBIT':
            computedBalance -= amount;
            break;
          case 'BLOCK':
            computedBlocked += amount;
            break;
          case 'UNBLOCK':
            computedBlocked -= amount;
            break;
          case 'SETTLEMENT':
            computedBalance -= amount;
            computedBlocked -= amount;
            break;
        }
      }
      
      // Update wallet with computed values
      await tx.update(wallets)
        .set({
          balance: computedBalance.toString(),
          blockedBalance: computedBlocked.toString(),
          lastReconciled: new Date(),
        })
        .where(eq(wallets.id, wallet.id));
      
      logger.info('Wallet recalculated from ledger', { 
        userId, 
        computedBalance, 
        computedBlocked 
      });
    });
  }
}
```

### 3.3 Integration Points

**Update `OrderService.placeOrder`:**
```typescript
// Before creating order:
const requiredMargin = MarginService.calculateRequiredMargin(payload, instrument);
const hasMargin = await WalletService.checkMargin(userId, requiredMargin);
if (!hasMargin) throw new ApiError("Insufficient balance", 400, "INSUFFICIENT_FUNDS");

// Inside transaction:
await WalletService.blockFunds(userId, requiredMargin, order.id, tx);
```

**Update `OrderService.cancelOrder`:**
```typescript
// When order is cancelled:
const blockedAmount = /* retrieve from order metadata */;
await WalletService.unblockFunds(userId, blockedAmount, order.id, tx);
```

**Update `ExecutionService.executeOrder`:**
```typescript
// When order executes:
const executionCost = trade.quantity * trade.price;
await WalletService.settleTrade(userId, executionCost, trade.id, tx);
```

**Update `PositionService.closePosition`:**
```typescript
// When position closes:
const proceeds = position.quantity * exitPrice;
await WalletService.creditProceeds(userId, proceeds, position.id, tx);
```

---

## Phase 4: API Routes

### 4.1 User Wallet Endpoints

**`GET /api/v1/wallet`** - Get user's wallet balance
```typescript
Response: {
  balance: number,
  blockedBalance: number,
  availableBalance: number,
  currency: string,
  lastReconciled: string
}
```

**`GET /api/v1/wallet/transactions`** - Get transaction history
```typescript
Query: { limit?, page?, type?, startDate?, endDate? }
Response: {
  transactions: Transaction[],
  pagination: { total, page, limit }
}
```

### 4.2 Admin Recovery Tools (Auth: Admin Only)

**`POST /api/v1/admin/wallet/recalculate/:userId`** - Recalculate wallet from ledger
```typescript
Description: Recomputes balance and blockedBalance from transaction ledger
Use Case: Recovery after detected inconsistency
Response: { balance, blockedBalance, transactionsProcessed }
```

**`POST /api/v1/admin/wallet/replay-ledger/:userId`** - Replay entire ledger
```typescript
Description: Deletes wallet cache and rebuilds from scratch
Use Case: Complete wallet reset/recovery
Response: { success, finalBalance }
```

**`GET /api/v1/admin/wallet/integrity-check`** - Check all wallets for inconsistencies
```typescript
Description: Validates wallet.balance === SUM(transactions) for all users
Response: { 
  totalWallets, 
  inconsistentWallets: [{ userId, walletBalance, ledgerBalance, diff }] 
}
```

**`POST /api/v1/admin/wallet/reset/:userId`** - Reset balance to initial (dev/testing)
```typescript
Description: Clears all transactions and resets to ₹10L
Response: { success, newBalance }
```

---

## Phase 5: Frontend Integration

### 5.1 Frontend Cleanup (CRITICAL)

**Remove these client-side financial simulations:**
- ❌ `useRiskStore` - Remove fake balance deduction
- ❌ `positions.store.ts` - Remove client-side PnL calculations
- ❌ `tradeExecution.store.ts` - Remove local equity tracking
- ❌ All mock data files (`@/content/watchlist`, `@/content/options`, etc.)

**Replace with API-driven state:**
- ✅ `/api/v1/wallet` - Real balance
- ✅ `/api/v1/user/positions` - Real positions with server-calculated PnL
- ✅ `/api/v1/user/trades` - Real trade history
- ✅ `/api/v1/market/search` - Real instrument data

### 5.2 Wallet Store (`stores/wallet.store.ts`)

```typescript
interface WalletState {
  balance: number;
  blockedBalance: number;
  availableBalance: number;
  transactions: Transaction[];
  isLoading: boolean;
  
  fetchWallet: () => Promise<void>;
  fetchTransactions: (filters?: TransactionFilters) => Promise<void>;
}
```

### 5.3 UI Components

**Dashboard Widget:**
- Display available balance prominently
- Show blocked funds with tooltip
- Real-time updates via polling (1s interval)
- Clear error messages for insufficient funds

**Transaction History Page:**
- Filterable ledger view (by type, date range)
- Export to CSV functionality
- Balance/blocked balance timeline chart

---

## Phase 6: Testing & Validation

### 6.1 Unit Tests
- [ ] Wallet creation for new users
- [ ] Margin check logic
- [ ] Block/unblock fund operations
- [ ] Settlement calculations
- [ ] Transaction ledger accuracy

### 6.2 Integration Tests
- [ ] Order placement → funds blocked
- [ ] Order cancellation → funds released
- [ ] Order execution → settlement processed
- [ ] Position closure → proceeds credited
- [ ] Concurrent operations (race conditions)

### 6.3 Edge Cases
- [ ] Insufficient balance handling
- [ ] Negative balance prevention
- [ ] Idempotency (duplicate transactions)
- [ ] Partial fills (options trading)

---

## Implementation Checklist

### Phase 1: Schema
- [ ] Create `wallet.schema.ts`
- [ ] Define `wallets` table
- [ ] Define `transactions` table
- [ ] Generate migration
- [ ] Apply migration
- [ ] Seed wallets for existing users

### Phase 2: Validation
- [ ] Create `wallet.ts` validation schemas
- [ ] Add margin check schema
- [ ] Add transaction schemas

### Phase 3: Service Layer
- [ ] Implement `WalletService`
- [ ] Add `getWallet` method
- [ ] Add `checkMargin` method
- [ ] Add `blockFunds` method
- [ ] Add `unblockFunds` method
- [ ] Add `settleTrade` method
- [ ] Add `creditProceeds` method
- [ ] Integrate with `OrderService`
- [ ] Integrate with `ExecutionService`
- [ ] Integrate with `PositionService`

### Phase 4: API Routes
- [ ] Create `GET /api/v1/wallet` route
- [ ] Create `GET /api/v1/wallet/transactions` route
- [ ] Add error handling
- [ ] Add logging

### Phase 5: Frontend
- [ ] Create `wallet.store.ts`
- [ ] Add balance display to dashboard
- [ ] Create transaction history page
- [ ] Add real-time balance updates
- [ ] Show insufficient balance errors

### Phase 6: Testing
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Test edge cases
- [ ] Manual QA testing

---

## Success Criteria

✅ **Functional:**
- Users cannot place orders with insufficient balance
- Balance is correctly blocked when orders are placed
- Balance is correctly debited when orders execute
- Balance is correctly credited when positions close
- Transaction history is accurate and complete

✅ **Technical:**
- All operations are atomic (using transactions)
- No race conditions or duplicate transactions
- Proper error handling and user feedback
- Comprehensive logging for debugging

✅ **User Experience:**
- Clear balance visibility on dashboard
- Helpful error messages for insufficient funds
- Transaction history for transparency
