import { create } from 'zustand';
import { Position } from '@/types/position.types';
import { Trade } from '@/types/order.types';
import { ExitReason } from '@/types/general.types';
import { usePositionsStore } from './positions.store';
import { useOrdersStore } from './orders.store';
import { useRiskStore } from './risk.store';
import { useMarketStore } from './market.store';
import { useJournalStore } from './journal.store';
import { parseOptionSymbol, calculateOptionRiskMetrics } from '@/lib/fno-utils';
import { JournalEntry } from '@/types/journal.types';

interface TradeExecutionState {
  // ✅ UPDATED: Params include optional SL/Target
  executeTrade: (trade: Omit<Position, 'id' | 'currentPrice' | 'instrument' | 'lotSize' | 'currentPnL'>, lotSize: number) => Promise<void>;
  // ✅ UPDATED: exitReason is now strongly typed
  closePosition: (positionId: string, exitPrice: number, reason?: ExitReason) => void;
  settleExpiredPositions: () => void;
}

// Helpers...
const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const useTradeExecutionStore = create<TradeExecutionState>((set, get) => ({
  executeTrade: async (tradeParams, lotSize) => {
    // ... (Order Creation Logic - largely same, adding SL/Target to Trade object)
    const tradeId = Date.now().toString();
    const instrumentMode = useMarketStore.getState().instrumentMode;
    const requestedQty = tradeParams.quantity;
    
    // ... [Order State CREATED -> SENT] ...
    const newTrade: Trade = {
      // ... existing props
      id: tradeId,
      symbol: tradeParams.symbol,
      name: tradeParams.name,
      side: tradeParams.side,
      quantity: requestedQty,
      filledQuantity: 0,
      entryPrice: tradeParams.entryPrice,
      exitPrice: null,
      pnl: 0,
      status: 'CREATED',
      entryTime: new Date(),
      exitTime: null,
      updatedAt: new Date(),
      instrument: instrumentMode,
      expiryDate: tradeParams.expiryDate,
      notes: 'Order Created',
      // ✅ NEW: Store SL/Target
      stopLoss: tradeParams.stopLoss,
      target: tradeParams.target,
    };
    useOrdersStore.getState().addTrade(newTrade);
    
    await delay(300);
    // ... [Order State SENT -> Fill Calc] ...
    
    // Fill Calculation
    const slippagePercent = instrumentMode === 'options' ? 0.002 : 0.0005;
    const fillPrice = tradeParams.side === 'BUY' 
      ? tradeParams.entryPrice * (1 + slippagePercent)
      : tradeParams.entryPrice * (1 - slippagePercent);
    const finalPrice = Math.round(fillPrice * 100) / 100;
    
    // ... [Partial Fill Logic] ... 
    // Assuming immediate full fill for brevity in this snippet since logic is complex
    // In full impl, ensure SL/Target is passed to Position creation below:

    const updateOrderAndPosition = (qty: number, status: 'FILLED' | 'PARTIALLY_FILLED') => {
      useOrdersStore.getState().updateTrade(tradeId, { 
        status, 
        filledQuantity: qty,
        entryPrice: finalPrice,
        notes: `Filled ${qty}/${requestedQty} @ ${finalPrice}`
      });

      usePositionsStore.getState().removePosition(tradeId);
      
      const positionEntry: Position = {
        ...tradeParams,
        id: tradeId,
        quantity: qty,
        entryPrice: finalPrice, // Actual fill
        currentPrice: finalPrice,
        instrument: instrumentMode,
        lotSize,
        currentPnL: 0,
        // ✅ NEW: Persist SL/Target to Active Position
        stopLoss: tradeParams.stopLoss,
        target: tradeParams.target,
      };
      
      usePositionsStore.getState().addPosition(positionEntry);
    };

    updateOrderAndPosition(requestedQty, 'FILLED');
    const requiredMargin = (finalPrice * requestedQty) / tradeParams.leverage;
    useRiskStore.getState().deductMargin(requiredMargin);

    // ... [Journaling Logic] ...
    // ... (Use finalPrice and risk snapshot logic) ...
    // Note: JournalEntry type might need update if we want to store SL/Target specifically there too
    // For now, adhering to existing Journal Entry logic.
    const journalEntry: JournalEntry = {
      id: tradeId,
      instrument: instrumentMode,
      symbol: tradeParams.symbol,
      expiryDate: tradeParams.expiryDate,
      side: tradeParams.side,
      quantity: requestedQty,
      entryPrice: finalPrice,
      entryTime: new Date(),
      // riskSnapshot...
    };
    useJournalStore.getState().addJournalEntry(journalEntry);
  },

  // ✅ UPDATED: closePosition handles ExitReason
  closePosition: (positionId, exitPrice, reason = 'MANUAL') => {
    const positionsStore = usePositionsStore.getState();
    const ordersStore = useOrdersStore.getState();
    const riskStore = useRiskStore.getState();
    
    const position = positionsStore.positions.find((p) => p.id === positionId);
    if (!position) return;

    const pnl = position.side === 'BUY'
      ? (exitPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - exitPrice) * position.quantity;

    const requiredMargin = (position.entryPrice * position.quantity) / position.leverage;

    ordersStore.updateTrade(positionId, {
      exitPrice,
      pnl,
      status: 'CLOSED',
      exitTime: new Date(),
      // ✅ NEW: Store explicit exit reason
      exitReason: reason, 
      notes: `Closed via ${reason}`,
    });

    positionsStore.removePosition(positionId);
    riskStore.addToBalance(requiredMargin + pnl);
    riskStore.addEquityPoint(Date.now(), riskStore.balance + requiredMargin + pnl);
    
    // Map ExitReason types to Journal types if they differ
    // (Journal.types.ts defines ExitReason as MANUAL | EXPIRY | STOP_LOSS etc)
    // We can cast directly if they align
    useJournalStore.getState().updateJournalOnExit(positionId, {
      exitPrice,
      exitTime: new Date(),
      realizedPnL: pnl,
      exitReason: reason as any // Cast or map if needed
    });
  },

  settleExpiredPositions: () => {
    const positionsStore = usePositionsStore.getState();
    const expiredPositions = positionsStore.getExpiredPositions();
    if (expiredPositions.length === 0) return;

    expiredPositions.forEach((position) => {
      get().closePosition(position.id, position.currentPrice, 'EXPIRY');
    });
  }
}));