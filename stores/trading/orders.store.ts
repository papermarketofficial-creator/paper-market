import { create } from 'zustand';
import { Trade, JournalEntry } from '@/types/order.types';
import { dummyTrades } from '@/content/trades';

interface OrdersState {
  trades: Trade[];
  journalEntries: JournalEntry[];
  // Actions
  addTrade: (trade: Trade) => void;
  updateTrade: (tradeId: string, updates: Partial<Trade>) => void;
  saveJournalEntry: (entry: JournalEntry) => void;
}

export const useOrdersStore = create<OrdersState>((set) => ({
  // Ensure dummy trades match new type (casting for simplicity in this migration)
  trades: dummyTrades.map(t => ({ 
    ...t, 
    filledQuantity: t.quantity, 
    status: t.status === 'OPEN' ? 'FILLED' : t.status as any, // Map OPEN -> FILLED for legacy
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
          ? { ...t, ...updates, updatedAt: new Date() } // Auto-update timestamp
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
}));