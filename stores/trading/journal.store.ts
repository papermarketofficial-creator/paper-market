import { create } from 'zustand';
import { JournalEntry } from '@/types/journal.types';

interface JournalState {
  entries: JournalEntry[];
  // Actions
  addJournalEntry: (entry: JournalEntry) => void;
  updateJournalOnExit: (id: string, exitData: Partial<JournalEntry>) => void;
  resetJournal: () => void;
}

export const useJournalStore = create<JournalState>((set) => ({
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
}));