import { MarketSlice } from '../types';
import { isMarketOpenIST } from '@/lib/market-hours';
import { toCanonicalSymbol, toInstrumentKey } from '@/lib/market/symbol-normalization';

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

const normalizeEpochSeconds = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.floor(value);
    }

    if (typeof value === 'string') {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            return Math.floor(numeric);
        }

        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) {
            return Math.floor(parsed / 1000);
        }
    }

    return null;
};

const normalizeSeriesTime = <T extends { time: unknown }>(rows: T[]): T[] =>
    rows
        .map((row) => {
            const time = normalizeEpochSeconds(row.time);
            if (time === null) return null;
            return { ...row, time } as T;
        })
        .filter((row): row is T => row !== null);

const mergeSeriesByTimeStrict = <T extends { time: unknown }>(
    existing: T[],
    incoming: T[]
): T[] => {
    const map = new Map<number, T>();

    for (const row of normalizeSeriesTime(existing)) {
        map.set(Number(row.time), row);
    }

    // Incoming rows overwrite overlap rows at identical timestamps.
    for (const row of normalizeSeriesTime(incoming)) {
        map.set(Number(row.time), row);
    }

    return [...map.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, row]) => row);
};

export const createChartDataSlice: MarketSlice<any> = (set, get) => ({
  // ─────────────────────────────────────────────────────────────────
  // 📊 Initial State
  // ─────────────────────────────────────────────────────────────────
  historicalData: [], // CandlestickData[]
  volumeData: [],    // HistogramData[]
  simulatedSymbol: null,
  simulatedInstrumentKey: null,
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
              const newCandles = normalizeSeriesTime(candles).sort((a: any, b: any) => (a.time as number) - (b.time as number));
              // 🔥 Apply colors to volume before sorting/merging
              const newlyColoredVolume = enrichVolumeWithColor(volume, newCandles);
              const newVolume = normalizeSeriesTime(newlyColoredVolume).sort((a: any, b: any) => (a.time as number) - (b.time as number));
              
              const currentHistory = get().historicalData;
              const currentVolume = get().volumeData;

              const previousOldestTime = currentHistory.length > 0
                  ? Number(currentHistory[0].time)
                  : null;
              const previousCount = currentHistory.length;

              const merged = mergeSeriesByTimeStrict(currentHistory, newCandles);
              const mergedVol = mergeSeriesByTimeStrict(currentVolume, newVolume);

              const mergedOldestTime = merged.length > 0
                  ? Number(merged[0].time)
                  : null;
              const appendedCount = merged.length - previousCount;
              const extendedFurtherBack = previousOldestTime === null ||
                  (mergedOldestTime !== null && mergedOldestTime < previousOldestTime);

              if (appendedCount <= 0 && !extendedFurtherBack) {
                  console.log('Pagination reached overlap-only window, setting hasMoreHistory=false');
                  set({ hasMoreHistory: false, isInitialLoad: false });
              } else {
                  set({
                      historicalData: merged,
                      volumeData: mergedVol
                  });

                  console.log(`Loaded ${Math.max(appendedCount, 0)} merged candles. Total: ${merged.length}`);
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
    const canonicalSymbol = toCanonicalSymbol(symbol);
    const state = get();
    const knownInstrument =
      state.stocksBySymbol?.[canonicalSymbol]?.instrumentToken ||
      state.stocks?.find((item: any) => toCanonicalSymbol(item.symbol) === canonicalSymbol)?.instrumentToken ||
      state.indices?.find((item: any) => toCanonicalSymbol(item.symbol) === canonicalSymbol)?.instrumentToken ||
      null;
    const resolvedInstrumentKey = toInstrumentKey(knownInstrument || canonicalSymbol);
    // 🔥 Detect interval from range or timeframe
    const rangeToInterval: Record<string, string> = {
        '1d': '1m',       // 1D range -> 1 minute candles
        '5d': '5m',       // 5D range -> 5 minute candles
        '1mo': '30m',     // 1M range -> 30 minute candles
        '3mo': '1h',      // 3M range -> Hourly candles
        '6mo': '1d',      // 6M range -> Daily candles (limit: hourly max 3mo)
        '1y': '1d',       // 1Y range -> Daily candles
        '3y': '1w',       // 3Y range -> Weekly candles
        '5y': '1mo',      // 5Y range -> Monthly candles
        // Upper case variants just in case
        '1D': '1m', '5D': '5m', '1M': '30m', '3M': '1h', '6M': '1d', '1Y': '1d', '5Y': '1mo'
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
        simulatedSymbol: canonicalSymbol,
        simulatedInstrumentKey: resolvedInstrumentKey,
        activeInterval: detectedInterval, // 🔥 Store for dynamic tick boundaries
        hasMoreHistory: true // 🔥 Reset pagination flag
    }); 
    
    try {
        let queryParams = `symbol=${canonicalSymbol}`;
        if (range) queryParams += `&range=${range}`;
        else queryParams += `&timeframe=${timeframe}`;

        console.log(`📊 Fetching history: ${canonicalSymbol}, range=${range || timeframe}, interval=${detectedInterval}`);
        
        const res = await fetch(`/api/v1/market/history?${queryParams}`);
        const data = await res.json();

        // Ignore stale response from an older request.
        if (get().currentRequestId !== requestId) {
            return;
        }

        if (data.success) {
            const { candles, volume } = data.data;
            
            // Normalize + strict sort/dedupe by epoch seconds.
            const sortedCandles = mergeSeriesByTimeStrict<any>([], candles as any[]);
            
            // 🔥 Apply colors to volume based on candle (Up=Teal, Down=Red)
            const coloredVolume = enrichVolumeWithColor(volume, sortedCandles);
            const sortedVolume = mergeSeriesByTimeStrict<any>([], coloredVolume as any[]);

            // 🔥 NO CAPPING: Allow unlimited candles for proper historical display
            // Infinite scroll will handle loading older data progressively
            let finalCandles = sortedCandles;
            let lastClose = sortedCandles.length > 0 ? sortedCandles[sortedCandles.length - 1].close : 0;

            // Keep chart close aligned with watchlist snapshot/live price outside market hours.
            // This avoids visible mismatch when latest tick stream is unavailable.
            if (!isMarketOpenIST() && sortedCandles.length > 0) {
                const state = get();
                const quoteKey = toInstrumentKey(state.simulatedInstrumentKey || resolvedInstrumentKey || canonicalSymbol);
                const snapshotPrice = Number(state.quotesByInstrument?.[quoteKey]?.price);
                if (Number.isFinite(snapshotPrice) && snapshotPrice > 0) {
                    const lastIdx = sortedCandles.length - 1;
                    const last = sortedCandles[lastIdx];
                    finalCandles = [...sortedCandles];
                    finalCandles[lastIdx] = {
                        ...last,
                        close: snapshotPrice,
                        high: Math.max(Number(last.high), snapshotPrice),
                        low: Math.min(Number(last.low), snapshotPrice),
                    };
                    lastClose = snapshotPrice;
                }
            }
            
            // Ignore stale response from an older request.
            if (get().currentRequestId !== requestId) {
                return;
            }

            set({
                historicalData: finalCandles,
                volumeData: sortedVolume,
                livePrice: lastClose,
                simulatedSymbol: canonicalSymbol,
                simulatedInstrumentKey: resolvedInstrumentKey
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

