import { Stock } from '@/types/equity.types';
import { WatchlistInstrument, MarketSlice } from '../types';
import { futuresList } from '@/content/futures';
import { optionsList } from '@/content/options';
import { indicesList } from '@/content/indices';

export const createWatchlistSlice: MarketSlice<any> = (set, get) => ({
  // ─────────────────────────────────────────────────────────────────
  // 📊 Initial State
  // ─────────────────────────────────────────────────────────────────
  stocks: [], // Will be populated from active watchlist
  instruments: [], // All tradable instruments
  watchlists: [],
  activeWatchlistId: null,
  isFetchingWatchlistData: false,
  
  futures: futuresList,
  options: optionsList,
  indices: indicesList,

  // ✅ New API Integration
  searchResults: [] as Stock[],
  isSearching: false,

  // ─────────────────────────────────────────────────────────────────
  // 🔄 Watchlist API Methods
  // ─────────────────────────────────────────────────────────────────
  fetchWatchlists: async () => {
    set({ isFetchingWatchlistData: true });
    try {
      const res = await fetch('/api/v1/watchlists');
      if (!res.ok) throw new Error('Failed to fetch watchlists');
      
      const { data } = await res.json();
      const defaultWatchlist = data.find((w: any) => w.isDefault);
      
      set({ 
        watchlists: data,
        activeWatchlistId: defaultWatchlist?.id || data[0]?.id || null,
      });
      
      // Auto-fetch instruments for default watchlist
      if (defaultWatchlist?.id) {
        await get().fetchWatchlistInstruments(defaultWatchlist.id);
      }
    } catch (error) {
      console.error('Failed to fetch watchlists:', error);
    } finally {
      set({ isFetchingWatchlistData: false });
    }
  },

  fetchInstruments: async () => {
    try {
      const res = await fetch('/api/v1/instruments');
      if (!res.ok) throw new Error('Failed to fetch instruments');
      
      const { data } = await res.json();
      set({ instruments: data });
    } catch (error) {
      console.error('Failed to fetch instruments:', error);
    }
  },

  fetchWatchlistInstruments: async (watchlistId: string) => {
    set({ isFetchingWatchlistData: true });
    try {
      const res = await fetch(`/api/v1/watchlists/${watchlistId}`);
      if (!res.ok) {
          const err = await res.text();
          console.error('Watchlist fetch error:', res.status, res.statusText, err);
          throw new Error(`Failed to fetch: ${res.status} ${err}`);
      }
      
      const { data } = await res.json();
      
      // Convert to Stock format for compatibility
      const stocks: Stock[] = data.instruments.map((inst: WatchlistInstrument) => ({
        symbol: inst.tradingsymbol,
        name: inst.name,
        price: parseFloat(inst.lastPrice) || 0, // ✅ From DB (updated daily via EOD service)
        change: 0,
        changePercent: 0,
        volume: 0,
        lotSize: inst.lotSize,
        instrumentToken: inst.instrumentToken,
      }));
      
      set({ stocks });
      console.log('✅ Watchlist loaded with DB prices');

      // ═══════════════════════════════════════════════════════════
      // 🔥 FETCH LIVE QUOTES: Update prices immediately like Upstox
      // ═══════════════════════════════════════════════════════════
      try {
        // Build instrument keys for quote fetch (use ISINs from DB)
        const instrumentKeys = data.instruments.map((inst: WatchlistInstrument) => inst.instrumentToken);
        console.log('🔍 Fetching live quotes for', instrumentKeys.length, 'instruments');
        
        // Fetch quotes using instrument tokens
        const quotesRes = await fetch('/api/v1/market/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instrumentKeys })
        });
        
        console.log('📡 Quote fetch response:', quotesRes.status, quotesRes.statusText);
        
        if (quotesRes.ok) {
          const quotesData = await quotesRes.json();
          console.log('📊 Quote data received:', quotesData);
          
          if (quotesData.success && quotesData.data) {
            const quotes = quotesData.data;
            console.log('✅ Processing', Object.keys(quotes).length, 'quotes');
            
            // Build a lookup map: instrument_token -> quote
            // Upstox returns quotes keyed by trading symbol (NSE_EQ:TCS)
            // but each quote contains instrument_token (NSE_EQ|INE467B01029)
            const quotesByToken: Record<string, any> = {};
            Object.values(quotes).forEach((quote: any) => {
              if (quote.instrument_token) {
                quotesByToken[quote.instrument_token] = quote;
              }
            });
            
            console.log('� Built lookup map with', Object.keys(quotesByToken).length, 'entries');
            
            // Update stock prices with live quotes
            const updatedStocks = stocks.map(stock => {
              // Look up quote by instrument token (ISIN)
              const quote = stock.instrumentToken ? quotesByToken[stock.instrumentToken] : null;
              if (quote && quote.last_price) {
                const price = quote.last_price;
                const close = quote.close_price || stock.price;
                const change = price - close;
                const changePercent = close > 0 ? (change / close) * 100 : 0;
                
                console.log(`💰 ${stock.symbol}: ${stock.price} → ${price} (${changePercent.toFixed(2)}%)`);
                
                return {
                  ...stock,
                  price,
                  change,
                  changePercent,
                };
              } else {
                console.warn(`⚠️ No quote found for ${stock.symbol} (${stock.instrumentToken})`);
              }
              return stock;
            });
            
            set({ stocks: updatedStocks });
            console.log('✅ Watchlist updated with live prices from Upstox');
          }
        } else {
          const errorText = await quotesRes.text();
          console.error('❌ Quote fetch failed:', quotesRes.status, errorText);
        }
      } catch (quoteError) {
        console.error('❌ Failed to fetch live quotes:', quoteError);
        // Not critical - SSE will update prices soon
      }

      // ─────────────────────────────────────────────────────────────────
      // 🔄 OPTIONAL: Refresh live prices if market is open
      // ─────────────────────────────────────────────────────────────────
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const isMarketHours = (hour === 9 && minute >= 15) || (hour > 9 && hour < 15) || (hour === 15 && minute <= 30);

      if (isMarketHours && stocks.length > 0) {
        console.log('📊 Market open - live prices will update via SSE stream');
        // Live prices will be updated automatically via the SSE stream
        // No need to fetch here - the stream is already running
      } else {
        console.log('🌙 Market closed - using EOD prices from database');
      }

    } catch (error) {
      console.error('Failed to fetch watchlist instruments:', error);
    } finally {
      set({ isFetchingWatchlistData: false });
    }
  },

  createWatchlist: async (name: string) => {
    try {
      const res = await fetch('/api/v1/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      
      if (!res.ok) throw new Error('Failed to create watchlist');
      
      // Refresh watchlists
      await get().fetchWatchlists();
    } catch (error) {
      console.error('Failed to create watchlist:', error);
      throw error;
    }
  },

  addToWatchlist: async (instrument: Stock) => {
    const { activeWatchlistId, stocks } = get();
    if (!activeWatchlistId) return;

    // Optimistic Update
    set({ stocks: [...stocks, instrument] });
    
    try {
      const res = await fetch(`/api/v1/watchlists/${activeWatchlistId}/instruments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instrumentToken: instrument.instrumentToken }),
      });
      
      if (!res.ok) throw new Error('Failed to add instrument');
      
      // Background validation (optional, can skip if optimistic is enough)
      // await get().fetchWatchlistInstruments(activeWatchlistId);
    } catch (error) {
      console.error('Failed to add instrument:', error);
      // Revert on failure
      set({ stocks }); 
      throw error;
    }
  },

  removeFromWatchlist: async (instrumentToken: string) => {
    const { activeWatchlistId, stocks } = get();
    if (!activeWatchlistId) return;

    // Optimistic Update
    const oldStocks = stocks;
    set({ stocks: stocks.filter(s => s.instrumentToken !== instrumentToken) });

    try {
      const res = await fetch(`/api/v1/watchlists/${activeWatchlistId}/instruments/${instrumentToken}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) throw new Error('Failed to remove instrument');
    } catch (error) {
       console.error('Failed to remove instrument:', error);
       // Revert on failure
       set({ stocks: oldStocks });
       throw error;
    }
  },
  
  prefetchInstrument: (instrumentKey: string) => {
      // Fire and forget fetch to warm up the cache
      // Mapping range '1d' to API params (simplified match with initializeSimulation logic)
      // Using '1d' as default prefetch interval if not complex
      fetch(`/api/v1/market/history?instrumentKey=${instrumentKey}&interval=1m&range=1d`)
         .catch(err => console.error('Prefetch failed', err));
  },


  setActiveWatchlist: (watchlistId: string) => {
    set({ activeWatchlistId: watchlistId });
    get().fetchWatchlistInstruments(watchlistId);
  },

  // ✅ Pure function getter, requires mode to be passed
  getCurrentInstruments: (mode: any) => {
    const state = get();
    switch (mode) {
      case 'equity':
        return state.stocks;
      case 'futures':
        return state.futures;
      case 'options':
        return state.options;
      case 'indices':
        return state.indices;
      default:
        return state.stocks;
    }
  },

  searchInstruments: async (query: string) => {
    if (!query) {
      set({ searchResults: [] });
      return;
    }
    set({ isSearching: true });
    try {
      const res = await fetch(`/api/v1/instruments/search?q=${query}`);
      const data = await res.json();

      if (data.success) {
        // Map API response to Stock interface
        const results = data.data.map((item: any) => ({
          symbol: item.tradingsymbol, // Fixed: Database returns tradingsymbol
          name: item.name,
          price: parseFloat(item.lastPrice),
          change: 0,
          changePercent: 0,
          volume: 0,
          lotSize: item.lotSize,
          instrumentToken: item.instrumentToken, // Crucial for adding to watchlist
          expiryDate: item.expiry ? new Date(item.expiry) : undefined,
          strikePrice: item.strike ? parseFloat(item.strike) : undefined,
          optionType: item.instrumentType === 'OPTION' ? (item.tradingsymbol.endsWith('CE') ? 'CE' : 'PE') : undefined
        }));
        set({ searchResults: results });
      }
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      set({ isSearching: false });
    }
  },
});
