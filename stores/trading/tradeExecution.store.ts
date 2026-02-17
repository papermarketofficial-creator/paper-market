import { create } from 'zustand';
import { Position } from '@/types/position.types';
import { Trade, TradeParams, OrderType } from '@/types/order.types';
import { InstrumentMode } from '@/types/general.types';
import { usePositionsStore } from './positions.store';
import { useOrdersStore } from './orders.store';
import { useJournalStore } from './journal.store';
import { useWalletStore } from '@/stores/wallet.store';
import { parseOptionSymbol, calculateOptionRiskMetrics } from '@/lib/fno-utils';
import { JournalEntry, ExitReason } from '@/types/journal.types';

type OrderPlacementParams = {
  instrumentToken: string;
  symbol: string;
  side: Position['side'];
  quantity: number;
  entryPrice?: number;
};

interface TradeExecutionState {
  // ✅ State
  pendingOrders: Trade[];
  pendingOrderDetails: Record<string, { leverage: number, lotSize: number }>; // Store metadata needed for Position creation
  isOrderProcessing: boolean;
  processingOrderCount: number;
  orderProcessingError: string | null;
  clearOrderProcessingError: () => void;

  // ✅ New Action: Place Order (Replaces simple executeTrade)
  placeOrder: (
    tradeParams: OrderPlacementParams,
    lotSize: number,
    instrumentMode: InstrumentMode,
    orderType?: 'MARKET' | 'LIMIT' | 'STOP',
    triggerPrice?: number
  ) => Promise<void>;

  fetchOrders: () => Promise<void>;

  // ✅ New Action: Process Tick (Matching Engine)
  processTick: (currentPrice: number, symbol: string) => void;

  // Legacy alias
  executeTrade: (
    trade: OrderPlacementParams,
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
  isOrderProcessing: false,
  processingOrderCount: 0,
  orderProcessingError: null,
  clearOrderProcessingError: () => set({ orderProcessingError: null }),

  placeOrder: async (tradeParams, lotSize, instrumentMode, orderType = 'MARKET', triggerPrice) => {
    let markedProcessing = false;
    try {
      if (!tradeParams.instrumentToken || tradeParams.instrumentToken.trim().length === 0) {
        throw new Error('instrumentToken is required for order placement');
      }

      set((state) => {
        const nextCount = state.processingOrderCount + 1;
        return {
          processingOrderCount: nextCount,
          isOrderProcessing: nextCount > 0,
          orderProcessingError: null,
        };
      });
      markedProcessing = true;

      console.log('[DEBUG] placeOrder called with:', {
        instrumentToken: tradeParams.instrumentToken,
        symbol: tradeParams.symbol,
        quantity: tradeParams.quantity,
        lotSize
      });

      const payload: any = {
        instrumentToken: tradeParams.instrumentToken,
        symbol: tradeParams.symbol,
        side: tradeParams.side,
        quantity: tradeParams.quantity,
        orderType: orderType,
      };

      console.log('[DEBUG] Sending payload:', payload);

      if (orderType === 'LIMIT') {
        payload.limitPrice = tradeParams.entryPrice;
      }

      const res = await fetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!data.success) {
        console.error("❌ Place Order API Failed:", data);
        console.error("❌ Error Details:", data.error);
        throw new Error(data.error?.message || "Order placement failed");
      }

      // Refresh Orders List
      get().fetchOrders();
      
      // Refresh Wallet Balance (funds may be blocked for pending orders)
      console.log('🔄 Refreshing wallet balance after order placement...');
      useWalletStore.getState().fetchWallet();

        } catch (error: any) {
      const message = error instanceof Error ? error.message : "Order placement failed";
      set({ orderProcessingError: message });
      console.error("[TradeExecution] Order placement failed", error);
      throw error;
    } finally {
      if (markedProcessing) {
        set((state) => {
          const nextCount = Math.max(0, state.processingOrderCount - 1);
          return {
            processingOrderCount: nextCount,
            isOrderProcessing: nextCount > 0,
          };
        });
      }
    }
  },

  fetchOrders: async () => {
    try {
      const res = await fetch('/api/v1/orders?status=OPEN');
      const data = await res.json();

      if (data.success) {
        // Map API response to Trade interface if needed, or use as is
        // For now assuming direct mapping for display
        set({ pendingOrders: data.data });
      }
    } catch (error) { // removed : any for cleaner code if configured strictly
      console.error("Fetch Orders Error:", error);
    }
  },

  // Deleted processTick as it's now backend driven
  processTick: (currentPrice, symbol) => {
    // No-op: Backend handles execution
  },

  // Legacy alias for compatibility during refactor
  executeTrade: async (trade, lotSize, mode) => {
    return get().placeOrder(trade, lotSize, mode, 'MARKET');
  },

  closePosition: async (positionId: string, exitPrice: number, reason = 'MANUAL') => {
    const positionsStore = usePositionsStore.getState();
    const position = positionsStore.positions.find((p) => p.id === positionId);

    if (!position) {
      console.error("Position not found:", positionId);
      return;
    }

    try {
      console.log(`[TradeExecution] Closing position ${position.symbol} (${reason})`);

      // Determine opposing side
      const exitSide = position.side === 'BUY' ? 'SELL' : 'BUY';
      if (!position.instrumentToken) {
        throw new Error(`Missing instrumentToken for position ${position.symbol}`);
      }

      // Place opposing Market Order to exit
      // We reuse the existing placeOrder API integration
      await get().placeOrder(
        {
          instrumentToken: position.instrumentToken,
          symbol: position.symbol,
          side: exitSide,
          quantity: position.quantity, // Quantity is already absolute in frontend model
          entryPrice: exitPrice, // Used for limit price if LIMIT order, ignored for MARKET
        },
        position.lotSize || 1,
        position.instrument as InstrumentMode, // 'equity' | 'futures' | 'options'
        'MARKET'
      );

      // Note: We don't manually remove position here.
      // The socket/polling will refresh positions list and it should be gone/reduced.
      // But for better UX we might want to refresh immediately
      setTimeout(() => {
        positionsStore.fetchPositions();
      }, 500);

      const pnl = position.side === 'BUY'
        ? (exitPrice - position.entryPrice) * position.quantity
        : (position.entryPrice - exitPrice) * position.quantity;

      // Record in Journal (Optional: Backend might automate this eventually)
      const exitReason: ExitReason = reason === 'EXPIRY SETTLEMENT' ? 'EXPIRY' : 'MANUAL';

      useJournalStore.getState().updateJournalOnExit(positionId, {
        exitPrice,
        exitTime: new Date(),
        realizedPnL: pnl,
        exitReason
      });

    } catch (error) {
      console.error("Failed to close position:", error);
      // toast.error("Failed to close position"); // Add toast if desired
    }
  },

  settleExpiredPositions: () => {
    // Deprecated: Backend handles expiry.
    console.warn("settleExpiredPositions is deprecated. Backend handles expiry.");
  }
}));










