import { create } from 'zustand';
import { JournalEntry } from '@/types/journal.types';

interface JournalState {
  entries: JournalEntry[];
  isLoading: boolean;
  // Actions
  fetchJournal: () => Promise<void>;
  addJournalEntry: (entry: JournalEntry) => void;
  updateJournalOnExit: (id: string, exitData: Partial<JournalEntry>) => void;
  resetJournal: () => void;
}

export const useJournalStore = create<JournalState>((set) => ({
  entries: [],
  isLoading: false,

  fetchJournal: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/v1/user/trades');
      const data = await res.json();

      if (data.success) {
        // Map backend trades to JournalEntry
        const mappedEntries: JournalEntry[] = data.data.map((t: any) => ({
          id: t.id, // Trade ID
          instrument: 'EQUITY', // Backend needs to store this, or derive
          symbol: t.symbol,
          entryTime: new Date(t.executedAt),
          side: t.side,
          quantity: t.quantity,
          entryPrice: parseFloat(t.price),
          // For Journal view, we might need Exit data if it's a closed trade
          // The current Trades API only returns individual executions.
          // Ideally, we need a PnL/ClosedPosition API or aggregating trades.
          // For MVP: We will treat individual executions as entries.
          realizedPnL: 0,
          exitPrice: 0,
          exitTime: null
        }));
        set({ entries: mappedEntries });
      }
    } catch (error) {
      console.error("Failed to fetch journal", error);
    } finally {
      set({ isLoading: false });
    }
  },

  // Legacy actions kept to prevent build errors in other components temporarily
  addJournalEntry: (entry) => set((state) => ({ entries: [...state.entries, entry] })),
  updateJournalOnExit: (id, exitData) => { },
  resetJournal: () => set({ entries: [] }),
}));