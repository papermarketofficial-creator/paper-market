import { useJournalStore } from '@/stores/trading/journal.store';
import { useOrdersStore } from '@/stores/trading/orders.store';
import { JournalEntry } from '@/types/journal.types';

export function useJournalEntries(): JournalEntry[] {
    const entries = useJournalStore((state) => state.entries);

    // Sort by entry time
    return [...entries].sort((a, b) =>
        new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime()
    );
}
