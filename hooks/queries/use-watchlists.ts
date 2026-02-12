import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Stock } from '@/types/equity.types';
import { isMarketOpenIST } from '@/lib/market-hours';

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

interface QuoteLike {
  last_price?: number;
  close_price?: number;
}

async function fetchBatchQuotes(instrumentKeys: string[]): Promise<Record<string, QuoteLike>> {
  const keys = Array.from(new Set(instrumentKeys.filter(Boolean)));
  if (keys.length === 0) return {};

  try {
    const res = await fetch('/api/v1/market/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instrumentKeys: keys }),
    });

    if (!res.ok) return {};

    const payload = await res.json();
    if (!payload?.success || typeof payload?.data !== 'object' || !payload.data) return {};

    return payload.data as Record<string, QuoteLike>;
  } catch {
    return {};
  }
}

async function fetchLatestClosePrice(symbol: string, instrumentToken?: string): Promise<number | null> {
  const candidates = [
    `/api/v1/market/history?symbol=${encodeURIComponent(symbol)}&range=1D`,
    instrumentToken
      ? `/api/v1/market/history?instrumentKey=${encodeURIComponent(instrumentToken)}&range=1D`
      : null,
  ].filter((u): u is string => Boolean(u));

  for (const url of candidates) {
    try {
      const historyRes = await fetch(url);
      if (!historyRes.ok) continue;

      const historyData = await historyRes.json();
      const candles = historyData?.data?.candles;
      if (!historyData?.success || !Array.isArray(candles) || candles.length === 0) continue;

      // History responses are not guaranteed to be sorted; select candle with max timestamp.
      const toTs = (candle: any): number => {
        const t = candle?.time;
        if (typeof t === 'number' && Number.isFinite(t)) return t;
        if (typeof t === 'string') {
          const parsed = Date.parse(t);
          if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
        }
        return 0;
      };

      const latestCandle = candles.reduce((latest: any, current: any) =>
        toTs(current) > toTs(latest) ? current : latest
      );

      const closePrice = Number(latestCandle?.close);
      if (Number.isFinite(closePrice) && closePrice > 0) {
        return closePrice;
      }
    } catch {
      // try next candidate
    }
  }

  return null;
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

      // Seed with live/broker quote snapshot so watchlist doesn't depend on stale DB lastPrice.
      const quoteInstrumentKeys = stocks
        .map((s) => s.instrumentToken)
        .filter((token): token is string => typeof token === 'string' && token.length > 0);
      const quoteMap = await fetchBatchQuotes(quoteInstrumentKeys);
      const quoteSeededSymbols = new Set<string>();
      if (Object.keys(quoteMap).length > 0) {
        stocks = stocks.map((stock) => {
          const token = stock.instrumentToken;
          if (!token) return stock;

          const quote = quoteMap[token];
          if (!quote) return stock;

          const last = Number(quote.last_price);
          if (!Number.isFinite(last) || last <= 0) return stock;
          quoteSeededSymbols.add(stock.symbol);

          const close = Number(quote.close_price ?? quote.last_price);
          const hasClose = Number.isFinite(close) && close > 0;

          return {
            ...stock,
            price: last,
            change: hasClose ? last - close : stock.change,
            changePercent: hasClose ? ((last - close) / close) * 100 : stock.changePercent,
          };
        });
      }
      
      // Use IST session clock so users in any timezone see consistent prices.
      const isMarketOpen = isMarketOpenIST();
      
      if (!isMarketOpen && stocks.length > 0) {
        console.log('🌙 Market closed - fetching candle close prices to match Chart');
        
        // Fetch last candle close for each instrument
        try {
          const updatedStocks = await Promise.all(
            stocks.map(async (stock) => {
              try {
                const closePrice = await fetchLatestClosePrice(stock.symbol, stock.instrumentToken);
                if (closePrice !== null) {
                  console.log(`🕯️ ${stock.symbol}: Using candle close ${closePrice} (was ${stock.price})`);
                  return {
                    ...stock,
                    price: closePrice,
                    change: closePrice - stock.price,
                    changePercent: stock.price > 0 ? ((closePrice - stock.price) / stock.price) * 100 : 0,
                  };
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
      } else if (stocks.length > 0) {
        // Market open path: if quote snapshot is missing for some symbols, avoid falling back to stale DB prices.
        const missingQuoteSymbols = stocks.filter((stock) => !quoteSeededSymbols.has(stock.symbol));
        if (missingQuoteSymbols.length > 0) {
          try {
            const fallbackStocks = await Promise.all(
              stocks.map(async (stock) => {
                if (quoteSeededSymbols.has(stock.symbol)) return stock;

                const latestCandlePrice = await fetchLatestClosePrice(stock.symbol, stock.instrumentToken);
                if (latestCandlePrice === null) return stock;

                return {
                  ...stock,
                  price: latestCandlePrice,
                  change: latestCandlePrice - stock.price,
                  changePercent: stock.price > 0 ? ((latestCandlePrice - stock.price) / stock.price) * 100 : 0,
                };
              })
            );

            stocks = fallbackStocks;
          } catch (error) {
            console.warn('⚠️ Candle fallback failed for some symbols during market hours:', error);
          }
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
