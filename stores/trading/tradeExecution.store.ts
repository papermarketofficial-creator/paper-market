import { create } from 'zustand';
import { Position } from '@/types/position.types';
import { Trade } from '@/types/order.types';
import { InstrumentMode } from '@/types/general.types';
import { usePositionsStore } from './positions.store';
import { useOrdersStore } from './orders.store';
import { useRiskStore } from './risk.store';
import { useJournalStore } from './journal.store';
import { parseOptionSymbol, calculateOptionRiskMetrics } from '@/lib/fno-utils';
import { JournalEntry, ExitReason } from '@/types/journal.types';

interface TradeExecutionState {
  // ✅ State
  pendingOrders: Trade[];
  pendingOrderDetails: Record<string, { leverage: number, lotSize: number }>; // Store metadata needed for Position creation

  // ✅ New Action: Place Order (Replaces simple executeTrade)
  placeOrder: (
    tradeParams: Omit<Position, 'id' | 'currentPrice' | 'instrument' | 'lotSize' | 'currentPnL'>,
    lotSize: number,
    instrumentMode: InstrumentMode,
    orderType?: 'MARKET' | 'LIMIT' | 'STOP', // Optional, default MARKET
    triggerPrice?: number
  ) => void;

  // ✅ New Action: Process Tick (Matching Engine)
  processTick: (currentPrice: number, symbol: string) => void;

  // Legacy alias
  executeTrade: (
    trade: Omit<Position, 'id' | 'currentPrice' | 'instrument' | 'lotSize' | 'currentPnL'>,
    lotSize: number,
    instrumentMode: InstrumentMode
  ) => Promise<void>;

  closePosition: (positionId: string, exitPrice: number, reason?: string) => void;
  settleExpiredPositions: () => void;
}

const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;

export const useTradeExecutionStore = create<TradeExecutionState>((set, get) => ({
  pendingOrders: [],
  pendingOrderDetails: {},

  placeOrder: (tradeParams, lotSize, instrumentMode, orderType = 'MARKET', triggerPrice) => {
    const state = get();
    const tradeId = Date.now().toString();

    // 1. Prepare Order Object
    const newOrder: Trade = {
      id: tradeId,
      symbol: tradeParams.symbol,
      name: tradeParams.name,
      side: tradeParams.side,
      quantity: tradeParams.quantity,
      filledQuantity: 0,
      entryPrice: tradeParams.entryPrice, // This is Limit Price for Limit orders
      exitPrice: 0,
      pnl: 0,
      status: 'OPEN', // Default to OPEN
      entryTime: new Date(),
      exitTime: null,
      updatedAt: new Date(),
      instrument: instrumentMode,
      expiryDate: tradeParams.expiryDate,
      notes: `${orderType} Order Placed`,
      stopLoss: tradeParams.stopLoss, // Ensure this maps correctly to position/trade
      target: tradeParams.target,
      orderType: orderType, // ✅ Proper field
    };

    // 2. Immediate Execution Check (Market Order)
    if (orderType === 'MARKET') {
      // Fill Immediately
      const requestedPrice = tradeParams.entryPrice;
      let fillPrice = requestedPrice;

      // Apply Slippage (Simulation)
      let slippagePercent = 0.0005;
      if (tradeParams.side === 'BUY') fillPrice *= (1 + slippagePercent);
      else fillPrice *= (1 - slippagePercent);

      fillPrice = Math.round(fillPrice * 100) / 100;

      newOrder.status = 'FILLED';
      newOrder.filledQuantity = newOrder.quantity;
      newOrder.entryPrice = fillPrice;
      newOrder.notes = `Market Fill @ ${fillPrice}`;

      // Create Position
      const newPosition: Position = {
        ...tradeParams,
        id: tradeId,
        entryPrice: fillPrice,
        currentPrice: fillPrice,
        instrument: instrumentMode,
        lotSize,
        currentPnL: 0,
        productType: 'NRML' as any, // Fix type issue temporarily or import ProductType
        timestamp: Date.now()
      };

      const requiredMargin = (fillPrice * tradeParams.quantity) / tradeParams.leverage;

      // Update Stores
      usePositionsStore.getState().addPosition(newPosition);
      useOrdersStore.getState().addTrade(newOrder);
      useRiskStore.getState().deductMargin(requiredMargin);

      const journalEntry: JournalEntry = {
        id: tradeId,
        instrument: instrumentMode,
        symbol: tradeParams.symbol,
        expiryDate: tradeParams.expiryDate,
        side: tradeParams.side,
        quantity: tradeParams.quantity,
        entryPrice: fillPrice,
        entryTime: new Date(),
      };
      useJournalStore.getState().addJournalEntry(journalEntry);

    } else {
      // LIMIT / STOP
      useOrdersStore.getState().addTrade(newOrder);

      set((s) => ({
        pendingOrders: [...s.pendingOrders, newOrder],
        pendingOrderDetails: {
          ...s.pendingOrderDetails,
          [tradeId]: { leverage: tradeParams.leverage, lotSize }
        }
      }));

      // Block Margin based on Limit Price
      const requiredMargin = (newOrder.entryPrice * newOrder.quantity) / tradeParams.leverage;
      useRiskStore.getState().deductMargin(requiredMargin);
    }
  },

  processTick: (currentPrice, symbol) => {
    const { pendingOrders, pendingOrderDetails } = get();
    if (pendingOrders.length === 0) return;

    const remainingOrders: Trade[] = [];
    let filledOrders = false;

    pendingOrders.forEach(order => {
      if (order.symbol !== symbol) {
        remainingOrders.push(order);
        return;
      }

      // Check Matching Logic
      let isFill = false;
      const type = order.orderType;
      const limitPrice = order.entryPrice;

      if (type === 'LIMIT') {
        if (order.side === 'BUY' && currentPrice <= limitPrice) isFill = true;
        if (order.side === 'SELL' && currentPrice >= limitPrice) isFill = true;
      }
      else if (type === 'STOP') {
        // Needs Trigger Logic. For MVP assuming Limit Price field acts as trigger for Stop
        // Not implemented fully yet
      }

      if (isFill) {
        // EXECUTE
        filledOrders = true;

        const fillPrice = currentPrice;

        // 1. Update Order
        useOrdersStore.getState().updateTrade(order.id, {
          status: 'FILLED',
          filledQuantity: order.quantity,
          entryPrice: fillPrice,
          notes: `Limit Fill @ ${fillPrice}`
        });

        // 2. Retrieve Metadata
        const details = pendingOrderDetails[order.id];
        const leverage = details ? details.leverage : 1;
        const lotSize = details ? details.lotSize : 1;

        // 3. Create Position
        const newPosition: Position = {
          id: order.id,
          symbol: order.symbol,
          name: order.name,
          side: order.side,
          quantity: order.quantity,
          entryPrice: fillPrice,
          currentPrice: fillPrice,
          instrument: order.instrument,
          leverage: leverage,
          lotSize: lotSize,
          currentPnL: 0,
          expiryDate: order.expiryDate,
          stopLoss: order.stopLoss,
          target: order.target,
          productType: 'NRML' as any,
          timestamp: Date.now()
        };

        usePositionsStore.getState().addPosition(newPosition);

        const journalEntry: JournalEntry = {
          id: order.id,
          instrument: order.instrument,
          symbol: order.symbol,
          expiryDate: order.expiryDate,
          side: order.side,
          quantity: order.quantity,
          entryPrice: fillPrice,
          entryTime: new Date(),
        };
        useJournalStore.getState().addJournalEntry(journalEntry);

      } else {
        remainingOrders.push(order);
      }
    });

    if (filledOrders) {
      set({ pendingOrders: remainingOrders });
    }
  },

  // Legacy alias for compatibility during refactor
  executeTrade: async (trade, lotSize, mode) => {
    get().placeOrder(trade, lotSize, mode, 'MARKET');
  },

  closePosition: (positionId, exitPrice, reason = 'MANUAL') => {
    // ... same as before
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
      notes: reason,
    });

    positionsStore.removePosition(positionId);
    riskStore.addToBalance(requiredMargin + pnl);
    riskStore.addEquityPoint(Date.now(), riskStore.balance + requiredMargin + pnl);

    const exitReason: ExitReason = reason === 'EXPIRY SETTLEMENT' ? 'EXPIRY' : 'MANUAL';

    useJournalStore.getState().updateJournalOnExit(positionId, {
      exitPrice,
      exitTime: new Date(),
      realizedPnL: pnl,
      exitReason
    });
  },

  settleExpiredPositions: () => {
    const positionsStore = usePositionsStore.getState();
    const expiredPositions = positionsStore.getExpiredPositions();
    if (expiredPositions.length === 0) return;

    expiredPositions.forEach((position) => {
      get().closePosition(
        position.id,
        position.currentPrice,
        'EXPIRY SETTLEMENT'
      );
    });
  }
}));