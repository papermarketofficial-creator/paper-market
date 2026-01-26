import { create } from 'zustand';
import { Trade, JournalEntry } from '@/types/order.types';

interface OrdersState {
  trades: Trade[];
  journalEntries: JournalEntry[];
  isLoading: boolean;

  // Actions
  fetchOrders: () => Promise<void>;
  addTrade: (trade: Trade) => void;
  updateTrade: (tradeId: string, updates: Partial<Trade>) => void;
}

export const useOrdersStore = create<OrdersState>((set) => ({
  trades: [],
  journalEntries: [],
  isLoading: false,

  fetchOrders: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/v1/orders'); // Fetch all orders (default limit 20)
      const data = await res.json();
      if (data.success) {
        // Map backend orders to Trade type if necessary
        // Assuming backend returns matching shape or close enough
        const mappedTrades: Trade[] = data.data.map((o: any) => ({
          id: o.id,
          symbol: o.symbol,
          side: o.side,
          quantity: o.quantity,
          filledQuantity: o.status === 'FILLED' ? o.quantity : 0, // Simplified
          status: o.status,
          entryPrice: parseFloat(o.limitPrice || o.averagePrice || "0"), // Adjust based on DB schema
          entryTime: new Date(o.createdAt),
          orderType: o.orderType,
          instrument: 'EQUITY', // Backend doesn't store instrument mode explicitly in Orders table yet?
          // Fallbacks for UI fields not in primitive Order table
          name: o.symbol,
          pnl: 0,
          exitPrice: 0,
          exitTime: null,
          updatedAt: new Date(o.updatedAt)
        }));
        set({ trades: mappedTrades });
      }
    } catch (error) {
      console.error("Failed to fetch orders", error);
    } finally {
      set({ isLoading: false });
    }
  },

  addTrade: (trade) => {
    set((state) => ({
      trades: [trade, ...state.trades],
    }));
  },

  updateTrade: (tradeId, updates) => {
    set((state) => ({
      trades: state.trades.map((t) =>
        t.id === tradeId
          ? { ...t, ...updates, updatedAt: new Date() }
          : t
      ),
    }));
  },
}));