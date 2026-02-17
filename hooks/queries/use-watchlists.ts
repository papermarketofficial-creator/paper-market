import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Stock } from '@/types/equity.types';
import { toInstrumentKey } from '@/lib/market/symbol-normalization';

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

type QuoteApiItem = {
  last_price?: number;
  close_price?: number;
};

function toQuoteLookup(payload: Record<string, QuoteApiItem>): Map<string, QuoteApiItem> {
  const out = new Map<string, QuoteApiItem>();

  for (const [rawKey, quote] of Object.entries(payload || {})) {
    const normalized = toInstrumentKey(rawKey);
    if (!normalized) continue;

    out.set(normalized, quote);
    out.set(normalized.replace('|', ':'), quote);
    out.set(normalized.replace(':', '|'), quote);
  }

  return out;
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

      if (baseStocks.length === 0) return baseStocks;

      try {
        const instrumentKeys = Array.from(
          new Set(
            baseStocks
              .map((stock) => stock.instrumentToken)
              .filter((token): token is string => Boolean(token))
              .map((token) => toInstrumentKey(token))
              .filter(Boolean)
          )
        );

        if (instrumentKeys.length === 0) return baseStocks;

        const quotesRes = await fetch('/api/v1/market/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instrumentKeys }),
        });

        if (!quotesRes.ok) return baseStocks;

        const quotesJson = await quotesRes.json();
        if (!quotesJson?.success || !quotesJson?.data || typeof quotesJson.data !== 'object') {
          return baseStocks;
        }

        const quoteLookup = toQuoteLookup(quotesJson.data as Record<string, QuoteApiItem>);

        return baseStocks.map((stock) => {
          if (!stock.instrumentToken) return stock;
          const key = toInstrumentKey(stock.instrumentToken);
          const quote = quoteLookup.get(key);
          if (!quote) return stock;

          const price = Number(quote.last_price);
          if (!Number.isFinite(price) || price <= 0) return stock;

          const closeRaw = Number(quote.close_price);
          const close = Number.isFinite(closeRaw) && closeRaw > 0 ? closeRaw : price;
          const change = price - close;
          const changePercent = close > 0 ? (change / close) * 100 : 0;

          return {
            ...stock,
            price,
            change,
            changePercent,
          };
        });
      } catch {
        return baseStocks;
      }
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

