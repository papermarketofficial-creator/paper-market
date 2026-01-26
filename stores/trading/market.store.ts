import { create } from 'zustand';
import { Stock } from '@/types/equity.types';
import { InstrumentMode } from '@/types/general.types';
import { stocksList } from '@/content/watchlist';
import { futuresList } from '@/content/futures';
import { optionsList } from '@/content/options';
import { indicesList } from '@/content/indices';
// import { generateNiftyData } from '@/lib/simulator/nifty.data'; // Inlined below

interface MarketState {
  stocks: Stock[];
  futures: Stock[];
  options: Stock[];
  indices: Stock[];
  watchlist: string[];
  // Actions
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  updateStockPrice: (symbol: string, price: number) => void;
  // Simulation
  historicalData: any[]; // CandlestickData[]
  volumeData: any[];     // HistogramData[]
  livePrice: number;
  simulatedSymbol: string | null;
  intervalId: NodeJS.Timeout | null;

  initializeSimulation: (symbol: string, timeframe?: string) => void;
  startSimulation: () => void;
  stopSimulation: () => void;

  // ✅ Pure function getter, requires mode to be passed
  getCurrentInstruments: (mode: InstrumentMode | 'indices') => Stock[];

  // API State
  searchResults: Stock[];
  isSearching: boolean;
  searchInstruments: (query: string, type?: string) => Promise<void>;

  optionChain: { underlying: string; underlyingPrice?: number; expiry?: string; strikes: any[] } | null;
  isFetchingChain: boolean;
  fetchOptionChain: (symbol: string, expiry?: string) => Promise<void>;
}

export const useMarketStore = create<MarketState>((set, get) => ({
  stocks: stocksList,
  futures: futuresList,
  options: optionsList,
  indices: indicesList,
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
      indices: state.indices.map((index) =>
        index.symbol === symbol ? { ...index, price } : index
      ),
    }));
  },

  // ✅ Simulation State
  historicalData: [] as any[], // CandlestickData[]
  volumeData: [] as any[],    // HistogramData[]
  livePrice: 0,
  simulatedSymbol: null as string | null,
  intervalId: null as NodeJS.Timeout | null,

  // ✅ Actions
  initializeSimulation: (symbol, timeframe = '5m') => {
    // Dynamic import removed in favor of top-level import to prevent runtime errors
    const interval = timeframe === '1m' ? 1 : timeframe === '5m' ? 5 : 15;
    const { candles, volume } = generateNiftyData(1, interval);

    const lastClose = candles[candles.length - 1].close;

    set({
      historicalData: candles,
      volumeData: volume,
      livePrice: lastClose,
      simulatedSymbol: symbol
    });
  },

  startSimulation: () => {
    const state = get();
    if (state.intervalId) return; // Already running

    const id = setInterval(() => {
      set((state) => {
        // Simulate a "Tick" - Just fluctuate the last candle's close for now
        // Or add new candle every X seconds?
        // For "Real-time" feel: Update the current Close of the last candle

        const data = [...state.historicalData];
        if (data.length === 0) return state;

        const lastIndex = data.length - 1;
        const lastCandle = { ...data[lastIndex] };

        const volatility = 2; // Tick vol
        const change = (Math.random() - 0.5) * volatility;

        lastCandle.close += change;
        lastCandle.high = Math.max(lastCandle.high, lastCandle.close);
        lastCandle.low = Math.min(lastCandle.low, lastCandle.close);

        data[lastIndex] = lastCandle;

        return {
          historicalData: data,
          livePrice: lastCandle.close
        };
      });
    }, 1000); // 1 Tick per second

    set({ intervalId: id });
  },

  stopSimulation: () => {
    const state = get();
    if (state.intervalId) {
      clearInterval(state.intervalId);
      set({ intervalId: null });
    }
  },

  // ✅ Pure function getter, requires mode to be passed
  getCurrentInstruments: (mode: InstrumentMode | 'indices') => {
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

  // ✅ New API Integration
  searchResults: [] as Stock[],
  isSearching: false,
  optionChain: null as { underlying: string; underlyingPrice?: number; expiry?: string; strikes: any[] } | null,
  isFetchingChain: false,

  searchInstruments: async (query: string, type?: string) => {
    if (!query) {
      set({ searchResults: [] });
      return;
    }
    set({ isSearching: true });
    try {
      const typeParam = type ? `&type=${type}` : '';
      const res = await fetch(`/api/v1/market/search?q=${query}${typeParam}`);
      const data = await res.json();

      if (data.success) {
        // Map API response to Stock interface
        const results = data.data.map((item: any) => ({
          symbol: item.symbol,
          name: item.name,
          price: parseFloat(item.lastPrice),
          change: 0, // Not available in search yet
          changePercent: 0,
          volume: 0,
          lotSize: item.lotSize,
          expiryDate: item.expiry ? new Date(item.expiry) : undefined,
          strikePrice: item.strike ? parseFloat(item.strike) : undefined,
          optionType: item.symbol.endsWith('CE') ? 'CE' : item.symbol.endsWith('PE') ? 'PE' : undefined
        }));
        set({ searchResults: results });
      }
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      set({ isSearching: false });
    }
  },

  fetchOptionChain: async (symbol: string, expiry?: string) => {
    set({ isFetchingChain: true });
    try {
      const expiryParam = expiry ? `&expiry=${expiry}` : '';
      const res = await fetch(`/api/v1/market/option-chain?symbol=${symbol}${expiryParam}`);
      const data = await res.json();

      if (data.success) {
        set({ optionChain: data.data });
      }
    } catch (error) {
      console.error("Option Chain fetch failed", error);
    } finally {
      set({ isFetchingChain: false });
    }
  }
}));

// --- Inlined Simulation Logic (To prevent Import Errors) ---

// Helper to generate random number in range
const random = (min: number, max: number) => Math.random() * (max - min) + min;

// Generate simulated intraday data for NIFTY
function generateNiftyData(days = 1, intervalMinutes = 5) {
  const candles: any[] = [];
  const volume: any[] = [];

  let currentPrice = 22500; // Base NIFTY Price

  // Start from 'days' ago
  const now = new Date();
  // Reset to 9:15 AM
  now.setHours(9, 15, 0, 0);

  // Adjust start time back by 'days'
  let timeIter = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

  // Total steps
  const totalMinutes = days * 6 * 60 + (days * 15); // Rough Approx
  const steps = totalMinutes / intervalMinutes;

  for (let i = 0; i < steps; i++) {
    // Trend Factor: Sine wave to simulate daily cycle + random walk
    const trend = Math.sin(i / 20) * 10;
    const volatility = 15; // NIFTY volatility per 5 mins
    const noise = random(-volatility, volatility);

    const open = currentPrice;
    const close = open + trend + noise;
    const high = Math.max(open, close) + random(0, volatility / 2);
    const low = Math.min(open, close) - random(0, volatility / 2);

    // Convert to Unix Timestamp (seconds)
    const time = Math.floor(timeIter.getTime() / 1000);

    candles.push({
      time,
      open,
      high,
      low,
      close
    });

    volume.push({
      time,
      value: random(50000, 500000), // Random volume
      color: close >= open ? '#22C55E' : '#EF4444'
    });

    currentPrice = close;

    // Increment Time
    timeIter = new Date(timeIter.getTime() + intervalMinutes * 60 * 1000);
  }

  return { candles, volume };
}