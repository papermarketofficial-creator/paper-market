import { create } from 'zustand';
import { Stock } from '@/types/equity.types';
import { InstrumentMode } from '@/types/general.types';
import { futuresList } from '@/content/futures';
import { optionsList } from '@/content/options';
import { indicesList } from '@/content/indices';

// ─────────────────────────────────────────────────────────────────
// 📋 Watchlist Types
// ─────────────────────────────────────────────────────────────────
interface Watchlist {
  id: string;
  name: string;
  isDefault: boolean;
  instrumentCount: number;
}

interface WatchlistInstrument {
  instrumentToken: string;
  tradingsymbol: string;
  name: string;
  lastPrice: string;
  lotSize: number;
  exchange: string;
  segment: string;
}

interface MarketState {
  // ─────────────────────────────────────────────────────────────────
  // 📊 Instruments & Watchlists (DB-backed)
  // ─────────────────────────────────────────────────────────────────
  stocks: Stock[]; // Populated from API
  instruments: WatchlistInstrument[]; // All tradable instruments
  watchlists: Watchlist[]; // User's watchlists
  activeWatchlistId: string | null; // Currently selected watchlist
  
  // Legacy (keep for futures/options/indices)
  futures: Stock[];
  options: Stock[];
  indices: Stock[];
  
  // ─────────────────────────────────────────────────────────────────
  // 🔄 Watchlist Actions
  // ─────────────────────────────────────────────────────────────────
  fetchWatchlists: () => Promise<void>;
  fetchInstruments: () => Promise<void>;
  fetchWatchlistInstruments: (watchlistId: string) => Promise<void>;
  createWatchlist: (name: string) => Promise<void>;
  addToWatchlist: (instrument: Stock) => Promise<void>;
  removeFromWatchlist: (instrumentToken: string) => Promise<void>;
  prefetchInstrument: (instrumentKey: string) => void;
  setActiveWatchlist: (watchlistId: string) => void;
  isFetchingWatchlistData: boolean; // ✅ New loading state
  
  updateStockPrice: (symbol: string, price: number, close?: number) => void;
  
  // ─────────────────────────────────────────────────────────────────
  // 📈 Simulation & Chart
  // ─────────────────────────────────────────────────────────────────
  historicalData: any[]; // CandlestickData[]
  volumeData: any[];    // HistogramData[]
  livePrice: number;
  simulatedSymbol: string | null;
  intervalId: NodeJS.Timeout | null;

  initializeSimulation: (symbol: string, timeframe?: string, range?: string) => Promise<void>;
  startSimulation: () => void;
  stopSimulation: () => void;
  updateLiveCandle: (tick: { price: number; volume?: number; time: number }, symbol: string) => void;

  getCurrentInstruments: (mode: InstrumentMode | 'indices') => Stock[];

  // API State
  searchResults: Stock[];
  isSearching: boolean;
  searchInstruments: (query: string, type?: string) => Promise<void>;

  optionChain: { underlying: string; underlyingPrice?: number; expiry?: string; strikes: any[] } | null;
  isFetchingChain: boolean;
  fetchOptionChain: (symbol: string, expiry?: string) => Promise<void>;

  isFetchingHistory: boolean;
  fetchMoreHistory: (symbol: string, range: string, endTime: number) => Promise<void>;
}

export const useMarketStore = create<MarketState>((set, get) => ({
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

  // ─────────────────────────────────────────────────────────────────
  // 🔄 Watchlist API Methods
  // ─────────────────────────────────────────────────────────────────
  fetchWatchlists: async () => {
    set({ isFetchingWatchlistData: true });
    try {
      const res = await fetch('/api/v1/watchlists');
      if (!res.ok) throw new Error('Failed to fetch watchlists');
      
      const { data } = await res.json();
      const defaultWatchlist = data.find((w: Watchlist) => w.isDefault);
      
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
      // 🔄 OPTIONAL: Refresh live prices if market is open
      // ═══════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════
  // 🛠️ UPDATE STOCK PRICE: Merge live prices into stocks array
  // ═══════════════════════════════════════════════════════════
  updateStockPrice: (symbol: string, price: number, close?: number) => {
    const { stocks } = get();
    
    const updatedStocks = stocks.map(stock => {
      if (stock.symbol === symbol) {
        const previousClose = close ?? stock.price; // Use provided close or current price as fallback
        const change = price - previousClose;
        const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;
        
        return {
          ...stock,
          price,
          change,
          changePercent,
        };
      }
      return stock;
    });
    
    set({ stocks: updatedStocks });
  },


  // ✅ Simulation State
  historicalData: [] as any[], // CandlestickData[]
  volumeData: [] as any[],    // HistogramData[]
  livePrice: 0,
  simulatedSymbol: null as string | null,
  intervalId: null as NodeJS.Timeout | null,

  // ✅ Actions
  // ✅ Actions
  isFetchingHistory: false,
  fetchMoreHistory: async (symbol, range, endTime) => {
      const state = get();
      if (state.isFetchingHistory) return;

      set({ isFetchingHistory: true });
      try {
          // endTime is Unix timestamp (seconds)
          const endDate = new Date(endTime * 1000).toISOString();
          
          let queryParams = `symbol=${symbol}`;
          if (range) queryParams += `&range=${range}`;
          queryParams += `&toDate=${endDate}`; // Pagination
  
          const res = await fetch(`/api/v1/market/history?${queryParams}`);
          const data = await res.json();
  
          if (data.success) {
              const { candles, volume } = data.data;
              if (candles.length === 0) {
                  set({ isFetchingHistory: false });
                  return; 
              }

              // Sort ascending
              const newCandles = [...candles].sort((a: any, b: any) => (a.time as number) - (b.time as number));
              const newVolume = [...volume].sort((a: any, b: any) => (a.time as number) - (b.time as number));
              
              const currentHistory = get().historicalData;
              const currentVolume = get().volumeData;

              // Prepend and Deduplicate
              // Simple check: if newCandles last time < currentHistory first time, just prepend.
              // But API overlap might occur.
              // Filter out candles that exist in currentHistory
              const existingTimes = new Set(currentHistory.map(c => c.time));
              const uniqueCandles = newCandles.filter((c: any) => !existingTimes.has(c.time));
              
              const existingVolTimes = new Set(currentVolume.map(v => v.time));
              const uniqueVolume = newVolume.filter((v: any) => !existingVolTimes.has(v.time));

              if (uniqueCandles.length > 0) {
                  set({
                      historicalData: [...uniqueCandles, ...currentHistory],
                      volumeData: [...uniqueVolume, ...currentVolume]
                  });
              }
          }
      } catch (e) {
          console.error("Fetch More History Failed", e);
      } finally {
          set({ isFetchingHistory: false });
      }
  },

  initializeSimulation: async (symbol, timeframe = '1d', range?: string) => { // timeframe is fallback if range not passed
    // 1. Set Loading FIRST to prevent empty-state flash
    set({ isFetchingHistory: true, historicalData: [], volumeData: [] }); 
    
    try {
        let queryParams = `symbol=${symbol}`;
        if (range) queryParams += `&range=${range}`;
        else queryParams += `&timeframe=${timeframe}`;

        const res = await fetch(`/api/v1/market/history?${queryParams}`);
        const data = await res.json();

        if (data.success) {
            const { candles, volume } = data.data;
            
            // Sort by time ascending
            const sortedCandles = [...candles].sort((a: any, b: any) => (a.time as number) - (b.time as number));
            const sortedVolume = [...volume].sort((a: any, b: any) => (a.time as number) - (b.time as number));

            const lastClose = sortedCandles.length > 0 ? sortedCandles[sortedCandles.length - 1].close : 0;
            
            set({
                historicalData: sortedCandles,
                volumeData: sortedVolume,
                livePrice: lastClose,
                simulatedSymbol: symbol
            });
        } else {
            console.error("Failed to fetch history:", data.error);
        }
    } catch (e) {
        console.error("Chart data fetch error", e);
    } finally {
        set({ isFetchingHistory: false });
    }
  },

  stopSimulation: () => {
    const id = get().intervalId;
    if (id) clearInterval(id);
    set({ intervalId: null });
  },

  // ✅ Live Candle Mutation (Upstox Pro Pattern)
  updateLiveCandle: (tick, symbol) => {
    const { historicalData, volumeData, simulatedSymbol } = get();
    
    // Normalize symbols for comparison (remove exchange prefix if present)
    const normalizeSymbol = (s: string) => {
      if (!s) return '';
      // Remove NSE_EQ:, NSE_FO:, etc.
      return s.replace(/^[A-Z_]+:/, '');
    };
    
    const tickSymbol = normalizeSymbol(symbol);
    const chartSymbol = normalizeSymbol(simulatedSymbol || '');
    
    // Safety check: Only update if the tick belongs to the CURRENTLY viewed chart
    if (chartSymbol !== tickSymbol) {
      console.log(`⚠️ Symbol mismatch: Chart=${chartSymbol}, Tick=${tickSymbol}`);
      return;
    }

    if (historicalData.length === 0) return;

    const lastCandle = historicalData[historicalData.length - 1];
    const lastVolume = volumeData.length > 0 ? volumeData[volumeData.length - 1] : null;

    // ✅ Check if tick belongs to the same candle interval
    // We assume 1-minute candles for now (standard for charts unless aggregated)
    // If we support other intervals, we need to pass interval to this function or store it
    const lastTime = lastCandle.time as number;
    const tickTime = tick.time;
    
    // Simple check: Is tick >= last candle time + 60s? (For 1m candles)
    // Or better: aligned to minute boundary
    // For robust handling, we check if floor(lastTime/60) == floor(tickTime/60)
    // NOTE: This assumes 1m interval. For dynamic intervals, we need 'interval' state.
    // Given the chart defaults to 1m/1d, we'll implement basic detection
    
    // Check if we need a NEW candle
    // We use a threshold. If tick is significantly newer, we append.
    // If tick is same period (e.g. within same minute/day), we update.
    
    // HACK: For now, if tick time > lastTime + 60 (approx), append.
    const TimeThreshold = 60; // 1 minute
    const isNewCandle = (tickTime - lastTime) >= TimeThreshold;

    if (isNewCandle) {
        // Append NEW Candle
        const newCandle = {
            time: tick.time, // Use actual tick time (or floor it)
            open: tick.price,
            high: tick.price,
            low: tick.price,
            close: tick.price,
            // volume: tick.volume || 0 // Volume for new candle
        };

        const newVolume = tick.volume ? {
            time: tick.time,
            value: tick.volume,
            color: '#089981' // Green on open
        } : null;

        console.log('📊 NEW Candle:', newCandle, 'Total candles:', historicalData.length + 1);
        set({
            historicalData: [...historicalData, newCandle],
            volumeData: newVolume ? [...volumeData, newVolume] : volumeData,
            livePrice: tick.price
        });
    } else {
        // Update EXISTING Candle
        const updatedCandle = {
          ...lastCandle,
          close: tick.price,
          high: Math.max(lastCandle.high as number, tick.price),
          low: Math.min(lastCandle.low as number, tick.price),
        };

        const updatedVolume = lastVolume && tick.volume ? {
          ...lastVolume,
          value: (lastVolume.value as number) + tick.volume,
          color: tick.price >= (lastCandle.open as number) ? '#089981' : '#F23645'
        } : lastVolume;

        console.log('📈 UPDATE Candle:', updatedCandle, 'Price:', tick.price);
        
        // ═══════════════════════════════════════════════════════════
        // 🛠️ FINAL FIX: Bypass Zustand to prevent re-render
        // ═══════════════════════════════════════════════════════════
        // Mutate arrays in place WITHOUT calling set()
        // This prevents Zustand from notifying subscribers
        historicalData[historicalData.length - 1] = updatedCandle;
        if (updatedVolume) {
          volumeData[volumeData.length - 1] = updatedVolume;
        }
        
        // Update livePrice directly on state object
        const state = get();
        state.livePrice = tick.price;
        
        // Trigger chart update via ChartController (bypasses React)
        // The ChartController will call series.update() directly
        // This is the high-performance path used by professional trading platforms
    }
  },

  startSimulation: () => {
    // Live Data Mode: No fake ticks needed.
    // The chart will be updated via updateStockPrice logic below.
    console.log("Starting Live Chart Updates...");
    // const state = get();
    // if (state.intervalId) return; 
    // ... disabled fake simulation ...
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
  },

  updateStockPrice: (symbol, price, close) => {
    set((state) => {
      // 1. Update Watchlist/Stock List
      const updateStock = (stock: Stock) => {
        if (stock.symbol !== symbol) return stock;
        
        let change = stock.change;
        let changePercent = stock.changePercent;

        if (close && close > 0) {
           change = price - close;
           changePercent = (change / close) * 100;
        }
        
        // Ensure we create a new object
        return { ...stock, price, change, changePercent };
      };

      // 2. Update Historical Chart Data (Live Candle)
      let newHistory = state.historicalData;
      
      
      if (state.simulatedSymbol === symbol && state.historicalData.length > 0) {
          // Clone the last candle
          const lastIndex = state.historicalData.length - 1;
          const lastCandle = { ...state.historicalData[lastIndex] };
          
          // Update OHLC
          lastCandle.close = price;
          if (price > lastCandle.high) lastCandle.high = price;
          if (price < lastCandle.low) lastCandle.low = price;
          
          // Replace it in the array (efficient copy)
          newHistory = [...state.historicalData];
          newHistory[lastIndex] = lastCandle;
          
          // Note: Volume update omitted for brevity/simplicity as we don't stream volume ticks yet
      }

      return {
        stocks: state.stocks.map(updateStock),
        futures: state.futures.map(updateStock),
        options: state.options.map(updateStock),
        indices: state.indices.map(updateStock),
        historicalData: newHistory, // Updates the chart!
        livePrice: price // needed?
      };
    });
  },
}));

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