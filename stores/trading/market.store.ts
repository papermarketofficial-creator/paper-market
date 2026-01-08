import { create } from 'zustand';
import { Stock } from '@/types/equity.types';
import { InstrumentMode } from '@/types/general.types';
import { stocksList } from '@/content/watchlist';
import { futuresList } from '@/content/futures';
import { optionsList } from '@/content/options';

interface MarketState {
  stocks: Stock[];
  futures: Stock[];
  options: Stock[];
  watchlist: string[];
  // Actions
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  updateStockPrice: (symbol: string, price: number) => void;
  // ✅ Pure function getter, requires mode to be passed
  getCurrentInstruments: (mode: InstrumentMode) => Stock[];
}

export const useMarketStore = create<MarketState>((set, get) => ({
  stocks: stocksList,
  futures: futuresList,
  options: optionsList,
  watchlist: ['RELIANCE', 'TCS', 'INFY'],

  addToWatchlist: (symbol) => {
    set((state) => ({
      watchlist: [...state.watchlist, symbol],
    }));
  },

  removeFromWatchlist: (symbol) => {
    set((state) => ({
      watchlist: state.watchlist.filter((s) => s !== symbol),
    }));
  },

  updateStockPrice: (symbol, price) => {
    set((state) => ({
      stocks: state.stocks.map((stock) =>
        stock.symbol === symbol ? { ...stock, price } : stock
      ),
      futures: state.futures.map((future) =>
        future.symbol === symbol ? { ...future, price } : future
      ),
      options: state.options.map((option) =>
        option.symbol === symbol ? { ...option, price } : option
      ),
    }));
  },

  // ✅ Logic relies on argument, not internal state
  getCurrentInstruments: (mode: InstrumentMode) => {
    const state = get();
    switch (mode) {
      case 'equity':
        return state.stocks;
      case 'futures':
        return state.futures;
      case 'options':
        return state.options;
      default:
        return state.stocks;
    }
  },
}));