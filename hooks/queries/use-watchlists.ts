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
  lastPrice: string;
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
      
      // Convert to Stock format for compatibility
      let stocks: Stock[] = data.instruments.map((inst: WatchlistInstrument) => ({
        symbol: inst.tradingsymbol,
        name: inst.name,
        price: parseFloat(inst.lastPrice) || 0,
        change: 0,
        changePercent: 0,
        volume: 0,
        lotSize: inst.lotSize,
        instrumentToken: inst.instrumentToken,
      }));
      
      // 🔥 CRITICAL: Check if market is closed and fetch candle close prices
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const isMarketOpen = (hour === 9 && minute >= 15) || (hour > 9 && hour < 15) || (hour === 15 && minute <= 30);
      
      if (!isMarketOpen && stocks.length > 0) {
        console.log('🌙 Market closed - fetching candle close prices to match Chart');
        
        // Fetch last candle close for each instrument
        try {
          const updatedStocks = await Promise.all(
            stocks.map(async (stock) => {
              try {
                const historyRes = await fetch(
                  `/api/v1/market/history?instrumentKey=${stock.instrumentToken}&range=1D`
                );
                
                if (historyRes.ok) {
                  const historyData = await historyRes.json();
                  if (historyData.success && historyData.data?.candles?.length > 0) {
                    const lastCandle = historyData.data.candles[historyData.data.candles.length - 1];
                    const closePrice = lastCandle.close;
                    
                    console.log(`🕯️ ${stock.symbol}: Using candle close ${closePrice} (was ${stock.price})`);
                    
                    return {
                      ...stock,
                      price: closePrice,
                      change: closePrice - stock.price,
                      changePercent: stock.price > 0 ? ((closePrice - stock.price) / stock.price) * 100 : 0,
                    };
                  }
                }
              } catch (err) {
                console.warn(`⚠️ Failed to fetch candle for ${stock.symbol}:`, err);
              }
              return stock;
            })
          );
          
          stocks = updatedStocks;
          console.log('✅ Watchlist updated with candle close prices (matching Chart)');
        } catch (error) {
          console.error('❌ Failed to fetch candle closes:', error);
        }
      }
      
      return stocks;
    },
    enabled: !!watchlistId, // Only run query if watchlistId exists
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
