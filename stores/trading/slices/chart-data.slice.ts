import { MarketSlice } from '../types';

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
  isInitialLoad: true, // 🔥 NEW: Track if this is the first load (show full overlay) vs pagination (show header spinner only)
  hasMoreHistory: true,
  currentRequestId: 0, // 🔥 CRITICAL: Prevent stale fetch overwrites

  // ─────────────────────────────────────────────────────────────────
  // 📈 Chart Data Actions
  // ─────────────────────────────────────────────────────────────────
  fetchMoreHistory: async (symbol: string, range: string, endTime: number) => {
      console.log(`📜 fetchMoreHistory called:`, { symbol, range, endTime });
      console.log(`📜 endTime as date: ${new Date(endTime * 1000).toISOString()}`);
      
      // Prevent fetching if already loading or no more history
      if (get().isFetchingHistory) {
          console.log('⏸️ fetchMoreHistory: Already fetching, skipping');
          return;
      }
      if (!get().hasMoreHistory) {
          console.log('⏸️ fetchMoreHistory: No more history available, skipping');
          return;
      }

      // 🔥 Pagination load - NOT initial load
      const requestId = get().currentRequestId + 1;
      set({ isFetchingHistory: true, isInitialLoad: false, currentRequestId: requestId });

      try {
          // 🔥 CRITICAL FIX: Send cursor as YYYY-MM-DD only
          // Prevents timezone mixing (UTC ISO vs IST formatter vs broker timezone)
          // This eliminates duplicate candles from overlapping fetches
          const toDateStr = new Date(endTime * 1000).toISOString().split('T')[0];
          
          let queryParams = `symbol=${symbol}`;
          if (range) queryParams += `&range=${range}`;
          queryParams += `&toDate=${toDateStr}`; // Pagination cursor (YYYY-MM-DD)
  
  
          console.log(`📜 Fetching more history: /api/v1/market/history?${queryParams}`);
          
          const res = await fetch(`/api/v1/market/history?${queryParams}`);
          const data = await res.json();

          // 🔥 CRITICAL: Check if this response is stale
          if (get().currentRequestId !== requestId) {
              console.log('⏸️ fetchMoreHistory: Stale response detected, ignoring');
              return;
          }
  
          console.log(`📜 API Response:`, { success: data.success, hasData: !!data.data });
          
          if (data.success) {
              const { candles, volume } = data.data;
              console.log(`📜 Received ${candles?.length || 0} candles from API`);
              
              // 🔥 CRITICAL: Broker returned empty → no more history
              if (!candles || candles.length === 0) {
                  set({ isFetchingHistory: false, hasMoreHistory: false });
                  console.log('📜 No more history available (empty response)');
                  return; 
              }

              // 🔥 CRITICAL FIX: Filter out candles with null/undefined time values
              // This prevents "00:00" timestamps and chart breaking
              const validCandles = candles.filter((c: any) => {
                  if (!c || c.time == null || c.time === undefined) {
                      console.warn('⚠️ Skipping candle with null/undefined time:', c);
                      return false;
                  }
                  // Also validate OHLC values
                  if (c.open == null || c.high == null || c.low == null || c.close == null) {
                      console.warn('⚠️ Skipping candle with null OHLC values:', c);
                      return false;
                  }
                  return true;
              });

              const validVolume = volume?.filter((v: any) => {
                  if (!v || v.time == null || v.time === undefined || v.value == null) {
                      console.warn('⚠️ Skipping volume with null values:', v);
                      return false;
                  }
                  return true;
              }) || [];

              console.log(`📜 Valid candles after filtering: ${validCandles.length} (filtered out ${candles.length - validCandles.length})`);

              if (validCandles.length === 0) {
                  set({ isFetchingHistory: false, hasMoreHistory: false });
                  console.log('📜 No valid candles after filtering, stopping pagination');
                  return;
              }

              // Sort ascending
              const newCandles = [...validCandles].sort((a: any, b: any) => (a.time as number) - (b.time as number));
              const newVolume = [...validVolume].sort((a: any, b: any) => (a.time as number) - (b.time as number));
              
              const currentHistory = get().historicalData;
              const currentVolume = get().volumeData;

              console.log(`📜 Current history: ${currentHistory.length} candles`);
              console.log(`📜 New candles time range: ${new Date(newCandles[0].time * 1000).toISOString()} to ${new Date(newCandles[newCandles.length - 1].time * 1000).toISOString()}`);

              // Prepend and Deduplicate
              const existingTimes = new Set(currentHistory.map(c => c.time));
              const uniqueCandles = newCandles.filter((c: any) => !existingTimes.has(c.time));
              
              const existingVolTimes = new Set(currentVolume.map(v => v.time));
              const uniqueVolume = newVolume.filter((v: any) => !existingVolTimes.has(v.time));

              console.log(`📜 Unique new candles after deduplication: ${uniqueCandles.length}`);

              if (uniqueCandles.length > 0) {
                  const merged = [...uniqueCandles, ...currentHistory];
                  const mergedVol = [...uniqueVolume, ...currentVolume];
                  
                  // 🔥 CRITICAL FIX: ALWAYS sort after merge
                  // Lightweight Charts requires STRICT ascending order
                  // Never assume - always enforce
                  merged.sort((a, b) => (a.time as number) - (b.time as number));
                  mergedVol.sort((a, b) => (a.time as number) - (b.time as number));
                  
                  // 🔥 CRITICAL: DO NOT cap during pagination
                  // Capping here deletes the candles we just fetched
                  set({
                      historicalData: merged,
                      volumeData: mergedVol
                  });
                  
                  console.log(`✅ Loaded ${uniqueCandles.length} new candles. Total: ${merged.length}`);
              } else {
                  console.log('📜 No new unique candles, setting hasMoreHistory=false');
                  set({ hasMoreHistory: false }); // No new unique candles
              }
          } else {
              console.error('📜 API returned error:', data.error);
          }
      } catch (e) {
          console.error("❌ Fetch More History Failed:", e);
      } finally {
          set({ isFetchingHistory: false });
      }
  },

  initializeSimulation: async (symbol: string, timeframe = '1d', range?: string) => {
    console.log('📊 initializeSimulation called:', { symbol, timeframe, range });
    
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
    console.log(`📊 Detected interval: ${detectedInterval} for range: ${range || timeframe}`);
    
    // 1. Set Loading FIRST to prevent empty-state flash
    const requestId = get().currentRequestId + 1;
    set({ 
        isFetchingHistory: true, 
        isInitialLoad: true, // 🔥 Initial load - show full overlay
        historicalData: [], 
        volumeData: [],
        activeInterval: detectedInterval, // 🔥 Store for dynamic tick boundaries
        hasMoreHistory: true, // 🔥 Reset pagination flag
        currentRequestId: requestId // 🔥 Track this request
    }); 
    
    try {
        let queryParams = `symbol=${symbol}`;
        if (range) queryParams += `&range=${range}`;
        else queryParams += `&timeframe=${timeframe}`;

        console.log(`📊 Fetching from API: /api/v1/market/history?${queryParams}`);
        
        const res = await fetch(`/api/v1/market/history?${queryParams}`);
        const data = await res.json();

        // 🔥 CRITICAL: Check if this response is stale (user switched stocks)
        if (get().currentRequestId !== requestId) {
            console.log('⏸️ initializeSimulation: Stale response detected, ignoring');
            set({ isFetchingHistory: false });
            return;
        }

        console.log(`📊 API Response:`, { success: data.success, hasData: !!data.data });

        if (data.success) {
            const { candles, volume } = data.data;
            
            console.log(`📊 Received from API: ${candles?.length || 0} candles, ${volume?.length || 0} volume bars`);
            
            // Validate data
            if (!candles || !Array.isArray(candles)) {
                console.error('❌ Invalid candles data:', data);
                set({ isFetchingHistory: false });
                return;
            }
            
            // 🔥 CRITICAL FIX: Filter out candles with null/undefined values
            // 🔍 DEBUG: Log first candle to see structure
            if (candles.length > 0) {
                console.log('🔍 First candle structure:', JSON.stringify(candles[0]));
                console.log('🔍 First candle types:', {
                    time: typeof candles[0].time,
                    open: typeof candles[0].open,
                    high: typeof candles[0].high,
                    low: typeof candles[0].low,
                    close: typeof candles[0].close
                });
            }
            
            const validCandles = candles.filter((c: any) => {
                if (!c || c.time == null || c.time === undefined) {
                    console.warn('⚠️ Skipping candle with null/undefined time:', c);
                    return false;
                }
                if (c.open == null || c.high == null || c.low == null || c.close == null) {
                    console.warn('⚠️ Skipping candle with null OHLC values:', c);
                    return false;
                }
                return true;
            });

            const validVolume = volume?.filter((v: any) => {
                if (!v || v.time == null || v.time === undefined || v.value == null) {
                    console.warn('⚠️ Skipping volume with null values:', v);
                    return false;
                }
                return true;
            }) || [];

            console.log(`📊 Valid data after filtering: ${validCandles.length} candles (filtered out ${candles.length - validCandles.length})`);

            if (validCandles.length === 0) {
                console.error('❌ No valid candles after filtering');
                set({ isFetchingHistory: false });
                return;
            }
            
            // Sort by time ascending
            const sortedCandles = [...validCandles].sort((a: any, b: any) => (a.time as number) - (b.time as number));
            const sortedVolume = [...validVolume].sort((a: any, b: any) => (a.time as number) - (b.time as number));

            // 🔥 NO CAPPING: Allow unlimited candles for proper historical display
            // Infinite scroll will handle loading older data progressively
            const lastClose = sortedCandles.length > 0 ? sortedCandles[sortedCandles.length - 1].close : 0;
            
            console.log(`📊 Setting ${sortedCandles.length} candles in store`);
            if (sortedCandles.length > 0) {
                const firstTime = new Date(sortedCandles[0].time * 1000).toISOString();
                const lastTime = new Date(sortedCandles[sortedCandles.length - 1].time * 1000).toISOString();
                console.log(`📊 Time range: ${firstTime} to ${lastTime}`);
            }
            
            set({
                historicalData: sortedCandles,
                volumeData: sortedVolume,
                livePrice: lastClose,
                simulatedSymbol: symbol
            });
            
            console.log(`✅ initializeSimulation complete: ${sortedCandles.length} candles loaded`);
        } else {
            console.error("❌ Failed to fetch history:", data.error);
        }
    } catch (e) {
        console.error("❌ Chart data fetch error:", e);
    } finally {
        set({ isFetchingHistory: false });
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
