import { MarketSlice } from '../types';


// Helper to add color to volume based on candle open/close
const enrichVolumeWithColor = (volume: any[], candles: any[]) => {
    // Create a map of time -> candle for fast lookup
    const candleMap = new Map(candles.map((c: any) => [c.time, c]));
    
    return volume.map((v: any) => {
        const candle = candleMap.get(v.time);
        if (!candle) return v; // Keep original if no matching candle
        
        const isUp = candle.close >= candle.open;
        return {
            ...v,
            color: isUp ? '#033d34' : '#61161c' // Teal for Up, Red for Down
        };
    });
};

export const createChartDataSlice: MarketSlice<any> = (set, get) => ({
  // ─────────────────────────────────────────────────────────────────
  // 📊 Initial State
  // ─────────────────────────────────────────────────────────────────
  historicalData: [], // CandlestickData[]
  volumeData: [],    // HistogramData[]
  simulatedSymbol: null,
  intervalId: null,
  activeInterval: '1m', // Default
  isFetchingHistory: false,
  isInitialLoad: false,
  hasMoreHistory: true,
  currentRequestId: 0,

  // ─────────────────────────────────────────────────────────────────
  // 📈 Chart Data Actions
  // ─────────────────────────────────────────────────────────────────
  fetchMoreHistory: async (symbol: string, range: string, endTime: number) => {
      // Prevent fetching if already loading or no more history
      if (get().isFetchingHistory) {
          console.log('⏸️ fetchMoreHistory: Already fetching, skipping');
          return;
      }
      if (!get().hasMoreHistory) {
          console.log('⏸️ fetchMoreHistory: No more history available, skipping');
          return;
      }

      // Pagination fetch: never treated as initial load.
      set({ isFetchingHistory: true, isInitialLoad: false });

      try {
          // Use strict Upstox V3 date format (YYYY-MM-DD) in IST for pagination cursor.
          const toDateStr = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Kolkata',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
          }).format(new Date(endTime * 1000));
          
          let queryParams = `symbol=${symbol}`;
          if (range) queryParams += `&range=${range}`;
          queryParams += `&toDate=${toDateStr}`; // Pagination cursor
  
          console.log(`📊 Fetching more history: ${symbol}, range=${range}, toDate=${toDateStr}`);
          
          const res = await fetch(`/api/v1/market/history?${queryParams}`);
          const data = await res.json();
  
          if (data.success) {
              const { candles, volume } = data.data;
              console.log(`📊 Received ${candles.length} candles from API`);
              
              // 🔥 CRITICAL: Broker returned empty → no more history
              if (candles.length === 0) {
                  set({ isFetchingHistory: false, isInitialLoad: false, hasMoreHistory: false });
                  console.log('📊 No more history available');
                  return; 
              }

              // Sort ascending
              const newCandles = [...candles].sort((a: any, b: any) => (a.time as number) - (b.time as number));
              // 🔥 Apply colors to volume before sorting/merging
              const newlyColoredVolume = enrichVolumeWithColor(volume, newCandles);
              const newVolume = [...newlyColoredVolume].sort((a: any, b: any) => (a.time as number) - (b.time as number));
              
              const currentHistory = get().historicalData;
              const currentVolume = get().volumeData;

              // Prepend and Deduplicate
              const existingTimes = new Set(currentHistory.map(c => c.time));
              const uniqueCandles = newCandles.filter((c: any) => !existingTimes.has(c.time));
              
              const existingVolTimes = new Set(currentVolume.map(v => v.time));
              const uniqueVolume = newVolume.filter((v: any) => !existingVolTimes.has(v.time));

              if (uniqueCandles.length > 0) {
                  const merged = [...uniqueCandles, ...currentHistory];
                  const mergedVol = [...uniqueVolume, ...currentVolume];
                  
                  // 🔥 CRITICAL: DO NOT cap during pagination
                  // Capping here deletes the candles we just fetched
                  set({
                      historicalData: merged,
                      volumeData: mergedVol
                  });
                  
                  console.log(`📊 Loaded ${uniqueCandles.length} new candles. Total: ${merged.length}`);
              } else {
                  console.log('📊 No new unique candles, setting hasMoreHistory=false');
                  set({ hasMoreHistory: false, isInitialLoad: false }); // No new unique candles
              }
          } else {
              console.error('📊 API returned error:', data.error);
          }
      } catch (e) {
          console.error("Fetch More History Failed", e);
      } finally {
          set({ isFetchingHistory: false, isInitialLoad: false });
      }
  },

  initializeSimulation: async (symbol: string, timeframe = '1d', range?: string) => {
    // 🔥 Detect interval from range or timeframe
    const rangeToInterval: Record<string, string> = {
        '1d': '1m',       // 1D range -> 1 minute candles
        '5d': '5m',       // 5D range -> 5 minute candles
        '1mo': '30m',     // 1M range -> 30 minute candles
        '3mo': '1d',      // 3M range -> Daily candles
        '6mo': '1d',      // 6M range -> Daily candles (limit: hourly max 3mo)
        '1y': '1d',       // 1Y range -> Daily candles
        '3y': '1w',       // 3Y range -> Weekly candles
        '5y': '1mo',      // 5Y range -> Monthly candles
        // Upper case variants just in case
        '1D': '1m', '5D': '5m', '1M': '30m', '3M': '1d', '6M': '1d', '1Y': '1d', '5Y': '1mo'
    };
    const detectedInterval = range ? (rangeToInterval[range] || '1d') : timeframe;
    
    const requestId = get().currentRequestId + 1;

    // 1. Set Loading FIRST to prevent empty-state flash
    set({
        currentRequestId: requestId,
        isFetchingHistory: true, 
        isInitialLoad: true,
        historicalData: [], 
        volumeData: [],
        simulatedSymbol: symbol,
        activeInterval: detectedInterval, // 🔥 Store for dynamic tick boundaries
        hasMoreHistory: true // 🔥 Reset pagination flag
    }); 
    
    try {
        let queryParams = `symbol=${symbol}`;
        if (range) queryParams += `&range=${range}`;
        else queryParams += `&timeframe=${timeframe}`;

        console.log(`📊 Fetching history: ${symbol}, range=${range || timeframe}, interval=${detectedInterval}`);
        
        const res = await fetch(`/api/v1/market/history?${queryParams}`);
        const data = await res.json();

        // Ignore stale response from an older request.
        if (get().currentRequestId !== requestId) {
            return;
        }

        if (data.success) {
            const { candles, volume } = data.data;
            
            // Sort by time ascending
            const sortedCandles = [...candles].sort((a: any, b: any) => (a.time as number) - (b.time as number));
            
            // 🔥 Apply colors to volume based on candle (Up=Teal, Down=Red)
            const coloredVolume = enrichVolumeWithColor(volume, sortedCandles);
            const sortedVolume = [...coloredVolume].sort((a: any, b: any) => (a.time as number) - (b.time as number));

            // 🔥 NO CAPPING: Allow unlimited candles for proper historical display
            // Infinite scroll will handle loading older data progressively
            const lastClose = sortedCandles.length > 0 ? sortedCandles[sortedCandles.length - 1].close : 0;
            
            // Ignore stale response from an older request.
            if (get().currentRequestId !== requestId) {
                return;
            }

            set({
                historicalData: sortedCandles,
                volumeData: sortedVolume,
                livePrice: lastClose,
                simulatedSymbol: symbol
            });
            
            console.log(`📊 Initial load: ${sortedCandles.length} candles`);
        } else {
            console.error("Failed to fetch history:", data.error);
        }
    } catch (e) {
        console.error("Chart data fetch error", e);
    } finally {
        if (get().currentRequestId === requestId) {
            set({ isFetchingHistory: false, isInitialLoad: false });
        }
    }
  },

  startSimulation: () => {
    // Placeholder
  },

  stopSimulation: () => {
    const id = get().intervalId;
    if (id) clearInterval(id);
    set({ intervalId: null });
  },
});
