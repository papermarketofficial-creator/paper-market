import { Stock } from '@/types/equity.types';
import { WatchlistInstrument, MarketSlice } from '../types';
import { futuresList } from '@/content/futures';
import { optionsList } from '@/content/options';
import { indicesList } from '@/content/indices';

export const createWatchlistSlice: MarketSlice<any> = (set, get) => ({
  // ─────────────────────────────────────────────────────────────────
  // 📊 Initial State (UI State Only - Data managed by TanStack Query)
  // ─────────────────────────────────────────────────────────────────
  stocks: [], // Live-updated prices from SSE (synced with TanStack Query data)
  instruments: [], // All tradable instruments
  activeWatchlistId: null, // UI state: which watchlist is selected
  
  futures: futuresList,
  options: optionsList,
  indices: indicesList,

  // ✅ Search functionality
  searchResults: [] as Stock[],
  isSearching: false,

  // ─────────────────────────────────────────────────────────────────
  // 🎯 UI State Management (Data fetching handled by TanStack Query)
  // ─────────────────────────────────────────────────────────────────
  
  // Set active watchlist ID (UI state only)
  setActiveWatchlistId: (watchlistId: string | null) => {
    set({ activeWatchlistId: watchlistId });
  },
  
  // Update stocks array (called by components after TanStack Query fetches data)
  setStocks: (stocks: Stock[]) => {
    set({ stocks });
  },
  
  // ─────────────────────────────────────────────────────────────────
  // 💰 Live Price Updates (from SSE stream)
  // ─────────────────────────────────────────────────────────────────
  // This updates prices in real-time as ticks arrive
  updateStockPrices: (priceUpdates: Record<string, number>) => {
    const { stocks } = get();
    const updatedStocks = stocks.map(stock => {
      const newPrice = priceUpdates[stock.symbol];
      if (newPrice !== undefined) {
        const change = newPrice - stock.price;
        const changePercent = stock.price > 0 ? (change / stock.price) * 100 : 0;
        return {
          ...stock,
          price: newPrice,
          change,
          changePercent,
        };
      }
      return stock;
    });
    set({ stocks: updatedStocks });
  },
  
  prefetchInstrument: (instrumentKey: string) => {
      // Fire and forget fetch to warm up the cache
      // Mapping range '1d' to API params (simplified match with initializeSimulation logic)
      // Using '1d' as default prefetch interval if not complex
      fetch(`/api/v1/market/history?instrumentKey=${instrumentKey}&interval=1m&range=1d`)
         .catch(err => console.error('Prefetch failed', err));
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
