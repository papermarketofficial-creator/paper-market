import { Stock } from '@/types/equity.types';
import { WatchlistInstrument, MarketSlice } from '../types';
import { indicesList } from '@/content/indices';

function buildStocksBySymbol(stocks: Stock[]): Record<string, Stock> {
  const bySymbol: Record<string, Stock> = {};
  for (const stock of stocks) {
    bySymbol[stock.symbol] = stock;
  }
  return bySymbol;
}

export const createWatchlistSlice: MarketSlice<any> = (set, get) => ({
  // ─────────────────────────────────────────────────────────────────
  // 📊 Initial State (UI State Only - Data managed by TanStack Query)
  // ─────────────────────────────────────────────────────────────────
  stocks: [], // Live-updated prices from SSE (synced with TanStack Query data)
  stocksBySymbol: {},
  instruments: [], // All tradable instruments
  activeWatchlistId: null, // UI state: which watchlist is selected
  
  futures: [],
  options: [],
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
    set({
      stocks,
      stocksBySymbol: buildStocksBySymbol(stocks),
    });
  },
  
  // ─────────────────────────────────────────────────────────────────
  // 💰 Live Price Updates (from SSE stream)
  // ─────────────────────────────────────────────────────────────────
  // This updates prices in real-time as ticks arrive
  updateStockPrices: (priceUpdates: Record<string, number>) => {
    const { stocks, stocksBySymbol } = get();
    const nextBySymbol: Record<string, Stock> = { ...stocksBySymbol };
    let hasAnyChange = false;

    for (const [symbol, nextPrice] of Object.entries(priceUpdates)) {
      const existing = nextBySymbol[symbol];
      if (!existing || existing.price === nextPrice) continue;

      const change = nextPrice - existing.price;
      const changePercent = existing.price > 0 ? (change / existing.price) * 100 : 0;
      nextBySymbol[symbol] = {
        ...existing,
        price: nextPrice,
        change,
        changePercent,
      };
      hasAnyChange = true;
    }

    if (!hasAnyChange) return;

    set({
      stocksBySymbol: nextBySymbol,
      stocks: stocks.map((stock) => nextBySymbol[stock.symbol] || stock),
    });
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

  searchInstruments: async (query: string, type?: string) => {
    if (!query) {
      set({ searchResults: [] });
      return;
    }
    set({ isSearching: true });
    try {
      const params = new URLSearchParams({ q: query });
      if (type) params.set('mode', type);

      const res = await fetch(`/api/v1/instruments/search?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        // Map API response to Stock interface
        const results = data.data.map((item: any) => ({
          symbol: item.tradingsymbol, // Fixed: Database returns tradingsymbol
          name: item.name,
          price: Number(item.price ?? item.lastPrice ?? 0),
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
