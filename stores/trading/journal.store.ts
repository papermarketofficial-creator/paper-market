import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { JournalEntry } from '@/types/journal.types';

interface JournalState {
  entries: JournalEntry[];
  // Actions
  addJournalEntry: (entry: JournalEntry) => void;
  updateJournalOnExit: (id: string, exitData: Partial<JournalEntry>) => void;
  resetJournal: () => void;
}

export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      entries: [],

      addJournalEntry: (entry) =>
        set((state) => ({
          entries: [...state.entries, entry],
        })),

      updateJournalOnExit: (id, exitData) =>
        set((state) => ({
          entries: state.entries.map((entry) =>
            entry.id === id ? { ...entry, ...exitData } : entry
          ),
        })),

      resetJournal: () => set({ entries: [] }),
    }),
    {
      name: 'paper-market-journal',
      storage: createJSONStorage(() => localStorage),
    }
  )
);