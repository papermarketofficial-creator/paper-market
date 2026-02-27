import { create } from 'zustand';
import { Trade, JournalEntry } from '@/types/order.types';
import { toast } from 'sonner';
import { useWalletStore } from '@/stores/wallet.store';

interface OrdersState {
  trades: Trade[];
  journalEntries: JournalEntry[];
  isLoading: boolean;
  hasFetched: boolean;
  error: string | null;

  // Actions
  fetchOrders: (filters?: { status?: string; limit?: number }) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  addTrade: (trade: Trade) => void;
  updateTrade: (tradeId: string, updates: Partial<Trade>) => void;
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  trades: [],
  journalEntries: [],
  isLoading: false,
  hasFetched: false,
  error: null,

  fetchOrders: async (filters = {}) => {
    set({ isLoading: true, error: null });
    try {
      // Build query params
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.limit) params.append('limit', filters.limit.toString());
      
      const res = await fetch(`/api/v1/orders?${params.toString()}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch orders');
      }
      
      if (data.success) {
        // Map backend orders to Trade type
        const mappedTrades: Trade[] = data.data.map((o: any) => {
          // Determine entry/exit/pnl based on whether this order reduced/closed a position.
          let entryPrice = 0;
          let exitPrice = 0;
          let pnl = 0;
          let status = o.status; // Default to backend status

          const hasClosingMetadata = o.averagePrice != null || o.realizedPnL != null;

          if (hasClosingMetadata) {
            // Closing/reducing order metadata is explicitly persisted by backend.
            pnl = o.realizedPnL != null ? parseFloat(o.realizedPnL) : 0;
            entryPrice = o.averagePrice != null ? parseFloat(o.averagePrice) : 0;
            exitPrice = o.executionPrice ? parseFloat(o.executionPrice) : 0;
            status = 'CLOSED';
          } else {
            // Opening order (or unfilled order)
            if (o.status === 'FILLED' && o.executionPrice) {
              entryPrice = parseFloat(o.executionPrice);
            } else if (o.orderType === 'LIMIT' && o.limitPrice) {
              entryPrice = parseFloat(o.limitPrice);
            }
          }

          return {
            id: o.id,
            symbol: o.symbol,
            side: o.side,
            quantity: o.quantity,
            filledQuantity: o.status === 'FILLED' ? o.quantity : 0,
            status, // Use updated status
            entryPrice, // Now reflects "Avg Entry" for closing orders
            entryTime: o.createdAt ? new Date(o.createdAt) : new Date(),
            orderType: o.orderType,
            instrument: 'EQUITY',
            name: o.symbol,
            pnl, // Now populated for closing orders
            exitPrice, // Now populated for closing orders
            exitTime: o.executedAt ? new Date(o.executedAt) : null,
            updatedAt: o.updatedAt ? new Date(o.updatedAt) : new Date(),
            expiryDate: o.expiryDate ? new Date(o.expiryDate) : undefined
          };
        });
        set({ trades: mappedTrades });
        console.log('✅ Fetched', mappedTrades.length, 'orders');
      }
    } catch (error: any) {
      console.error("Failed to fetch orders:", error);
      set({ error: error.message });
      toast.error('Failed to load orders');
    } finally {
      set({ isLoading: false,hasFetched: true,  });
    }
  },

  cancelOrder: async (orderId: string) => {
    try {
      const res = await fetch(`/api/v1/orders/${orderId}`, {
        method: 'DELETE',
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to cancel order');
      }
      
      if (data.success) {
        // Update local state
        set((state) => ({
          trades: state.trades.map((t) =>
            t.id === orderId
              ? { ...t, status: 'CANCELLED', updatedAt: new Date() }
              : t
          ),
        }));
        
        // Refresh wallet (blocked funds released)
        useWalletStore.getState().fetchWallet();
        
        toast.success('Order cancelled successfully');
        console.log('✅ Cancelled order:', orderId);
      }
    } catch (error: any) {
      console.error("Failed to cancel order:", error);
      toast.error(error.message);
      throw error;
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
