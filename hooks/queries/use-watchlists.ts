import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Stock } from '@/types/equity.types';

// ═══════════════════════════════════════════════════════════
// 📊 WATCHLIST QUERY HOOKS
// ═══════════════════════════════════════════════════════════

interface Watchlist {
  id: string;
  name: string;
  isDefault: boolean;
  userId: string;
}

interface WatchlistInstrument {
  instrumentToken: string;
  tradingsymbol: string;
  name: string;
  lotSize: number;
}


// ─────────────────────────────────────────────────────────────────
// 🔍 QUERY: Fetch all watchlists
// ─────────────────────────────────────────────────────────────────
export function useWatchlists() {
  return useQuery({
    queryKey: ['watchlists'],
    queryFn: async () => {
      const res = await fetch('/api/v1/watchlists');
      if (!res.ok) throw new Error('Failed to fetch watchlists');
      const { data } = await res.json();
      return data as Watchlist[];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

// ─────────────────────────────────────────────────────────────────
// 🔍 QUERY: Fetch instruments for a specific watchlist
// ─────────────────────────────────────────────────────────────────
export function useWatchlistInstruments(watchlistId: string | null) {
  return useQuery({
    queryKey: ['watchlist', watchlistId],
    queryFn: async () => {
      if (!watchlistId) return [];
      
      const res = await fetch(`/api/v1/watchlists/${watchlistId}`);
      if (!res.ok) throw new Error('Failed to fetch watchlist instruments');
      
      const { data } = await res.json();

      // Start with neutral placeholder values.
      const baseStocks: Stock[] = data.instruments.map((inst: WatchlistInstrument) => {
        return {
          symbol: inst.tradingsymbol,
          name: inst.name,
          price: 0,
          change: 0,
          changePercent: 0,
          volume: 0,
          lotSize: inst.lotSize,
          instrumentToken: inst.instrumentToken,
        };
      });

      return baseStocks;
    },
    enabled: !!watchlistId, // Only run query if watchlistId exists
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: 0,
    placeholderData: (previousData) => previousData,
  });
}

// ─────────────────────────────────────────────────────────────────
// ✏️ MUTATION: Create new watchlist
// ─────────────────────────────────────────────────────────────────
export function useCreateWatchlist() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/v1/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      
      if (!res.ok) throw new Error('Failed to create watchlist');
      return res.json();
    },
    onSuccess: () => {
      // ✅ Invalidate watchlists query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['watchlists'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// ✏️ MUTATION: Add instrument to watchlist
// ─────────────────────────────────────────────────────────────────
export function useAddInstrument(watchlistId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (instrumentToken: string) => {
      const res = await fetch(`/api/v1/watchlists/${watchlistId}/instruments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instrumentToken }),
      });
      
      if (!res.ok) throw new Error('Failed to add instrument');
      return res.json();
    },
    onSuccess: () => {
      // ✅ Invalidate specific watchlist query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['watchlist', watchlistId] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// ✏️ MUTATION: Remove instrument from watchlist
// ─────────────────────────────────────────────────────────────────
export function useRemoveInstrument(watchlistId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (instrumentToken: string) => {
      const res = await fetch(`/api/v1/watchlists/${watchlistId}/instruments/${instrumentToken}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) throw new Error('Failed to remove instrument');
      return res.json();
    },
    onSuccess: () => {
      // ✅ Invalidate specific watchlist query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['watchlist', watchlistId] });
    },
  });
}

