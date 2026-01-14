import { useJournalStore } from '@/stores/trading/journal.store';
import { useOrdersStore } from '@/stores/trading/orders.store';
import { JournalEntry } from '@/types/journal.types';

export function useJournalEntries(): JournalEntry[] {
    const entries = useJournalStore((state) => state.entries);
    const trades = useOrdersStore((state) => state.trades);

    // Sync/Merge Logic: Ensure all closed trades appear in Journal even if not in JournalStore explicitly
    const closedTrades = trades.filter(t => t.status === 'CLOSED');

    const mergedEntries = [...entries];

    closedTrades.forEach(trade => {
        // Avoid duplicates if trade is already in journal
        if (!mergedEntries.find(e => e.id === trade.id)) {
            mergedEntries.push({
                id: trade.id,
                instrument: trade.instrument || 'equity', // Fallback
                symbol: trade.symbol,
                expiryDate: trade.expiryDate,
                side: trade.side,
                quantity: trade.quantity,
                entryPrice: trade.entryPrice,
                exitPrice: trade.exitPrice || 0, // Ensure not null
                entryTime: trade.entryTime,
                exitTime: trade.exitTime || new Date(),
                realizedPnL: trade.pnl || 0, // Ensure not null
                exitReason: 'MANUAL',
                notes: trade.notes,
            });
        }
    });

    // Sort by exit time (recent first) or entry time
    return mergedEntries.sort((a, b) =>
        new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime()
    );
}
