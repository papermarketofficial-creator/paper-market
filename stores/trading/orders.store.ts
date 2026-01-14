import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Trade, JournalEntry } from '@/types/order.types';
import { dummyTrades } from '@/content/trades';

interface OrdersState {
  trades: Trade[];
  journalEntries: JournalEntry[];
  // Actions
  addTrade: (trade: Trade) => void;
  updateTrade: (tradeId: string, updates: Partial<Trade>) => void;
  saveJournalEntry: (entry: JournalEntry) => void;
  reset: () => void;
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set) => ({
      // Initialize with dummy data only if storage is empty (handled by persist logic merge, 
      // but simplistic approach: default is dummy)
      trades: dummyTrades.map(t => ({
        ...t,
        filledQuantity: t.quantity,
        status: t.status === 'OPEN' ? 'FILLED' : t.status as any,
        updatedAt: t.entryTime
      })) as Trade[],

      journalEntries: [],

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

      saveJournalEntry: (entry) => {
        set((state) => ({
          journalEntries: [
            ...state.journalEntries.filter((e) => e.tradeId !== entry.tradeId),
            entry,
          ],
        }));
      },

      reset: () => set({
        trades: dummyTrades.map(t => ({
          ...t,
          filledQuantity: t.quantity,
          status: t.status === 'OPEN' ? 'FILLED' : t.status as any,
          updatedAt: t.entryTime
        })) as Trade[],
        journalEntries: []
      }),
    }),
    {
      name: 'paper-market-orders',
      storage: createJSONStorage(() => localStorage),
    }
  )
);