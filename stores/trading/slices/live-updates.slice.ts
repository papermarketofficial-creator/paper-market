import { Stock } from '@/types/equity.types';
import { MarketSlice } from '../types';
import { chartRegistry } from '@/lib/trading/chart-registry';

export const createLiveUpdatesSlice: MarketSlice<any> = (set, get) => ({
  // ─────────────────────────────────────────────────────────────────
  // 📊 Initial State
  // ─────────────────────────────────────────────────────────────────
  livePrice: 0,
  optionChain: null,
  isFetchingChain: false,

  // ─────────────────────────────────────────────────────────────────
  // ⚡ Live Update Actions
  // ─────────────────────────────────────────────────────────────────
  
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

  updateStockPrice: (symbol: string, price: number, close?: number) => {
    set((state: any) => {
      // Update Watchlist/Stock List only
      const updateStock = (stock: Stock) => {
        if (stock.symbol !== symbol) return stock;
        
        let change = stock.change;
        let changePercent = stock.changePercent;

        if (close && close > 0) {
           change = price - close;
           changePercent = (change / close) * 100;
        }
        
        return { ...stock, price, change, changePercent };
      };

      // ✅ SINGLE WRITER PRINCIPLE: Only ChartController updates historicalData
      // updateLiveCandle() handles all chart data mutations via ChartController
      // This function only updates watchlist prices

      return {
        stocks: state.stocks.map(updateStock),
        futures: state.futures.map(updateStock),
        options: state.options.map(updateStock),
        indices: state.indices.map(updateStock),
        livePrice: price
      };
    });
  },

  updateLiveCandle: (tick: { price: number; volume?: number; time: number }, symbol: string) => {
    const { historicalData, volumeData, simulatedSymbol, activeInterval } = get();
    
    // Normalize symbols for comparison (remove exchange prefix if present)
    const normalizeSymbol = (s: string) => {
      if (!s) return '';
      // Remove NSE_EQ:, NSE_FO:, etc.
      return s.replace(/^[A-Z_]+:/, '');
    };
    
    const tickSymbol = normalizeSymbol(symbol);
    const chartSymbol = normalizeSymbol(simulatedSymbol || '');
    
    // 🔥 HARD GUARD: Silently reject cross-symbol ticks
    // This prevents chart crashes when switching symbols
    if (tickSymbol !== chartSymbol) {
        // console.warn(`⚠️ Cross-symbol tick rejected: Tick=${tickSymbol}, Chart=${chartSymbol}`);
        return;
    }

    if (!historicalData || historicalData.length === 0) return;

    const lastCandle = historicalData[historicalData.length - 1];
    const lastVolume = volumeData && volumeData.length > 0 ? volumeData[volumeData.length - 1] : null;
    
    const tickTime = tick.time * 1000; // Convert to ms
    const candleTime = (lastCandle.time as number) * 1000;

    // 🔥 DYNAMIC INTERVAL CALCULATION
    // Use activeInterval from store to decide when to spawn a new candle
    const intervalMap: Record<string, number> = {
        '1m': 60 * 1000,
        '5m': 5 * 60 * 1000,
        '15m': 15 * 60 * 1000,
        '30m': 30 * 60 * 1000,
        '1h': 60 * 60 * 1000
    };
    
    const intervalMs = intervalMap[activeInterval] || 60 * 1000;
    
    // Check if we need a new candle
    // We want to snap to the interval boundaries
    // e.g. 09:15:00, 09:16:00 for 1m
    const currentIntervalStart = Math.floor(tickTime / intervalMs) * intervalMs;
    const lastCandleStart = Math.floor(candleTime / intervalMs) * intervalMs;
    
    const isNewCandle = currentIntervalStart > lastCandleStart;

    if (isNewCandle) {
        // New Candle
        const newCandle = {
            time: currentIntervalStart / 1000, // Back to seconds for LWC
            open: tick.price,
            high: tick.price,
            low: tick.price,
            close: tick.price,
        };
        
        const newVol = tick.volume ? {
            time: currentIntervalStart / 1000,
            value: tick.volume,
            color: '#26a69a' // Green for up (initial)
        } : null;

        console.log('📝 NEW Candle:', newCandle, 'Total candles:', historicalData.length + 1);
        
        // Mutate array (Zustand immer-like behavior not available, direct push)
        historicalData.push(newCandle);
        if (newVol && volumeData) volumeData.push(newVol);
        
        // Trigger ChartController update
        const controller = chartRegistry.get(chartSymbol);
        if (controller) {
          controller.updateCandle(newCandle as any);
        }

    } else {
        // Update Existing Candle
        const updatedCandle = {
            ...lastCandle,
            high: Math.max(lastCandle.high, tick.price),
            low: Math.min(lastCandle.low, tick.price),
            close: tick.price
        };
        
        const isUp = updatedCandle.close >= updatedCandle.open;

        const updatedVolume = tick.volume && lastVolume ? {
            ...lastVolume,
            value: (lastVolume.value || 0) + (tick.volume || 0), // Accumulate volume
            color: isUp ? '#26a69a' : '#ef5350'
        } : lastVolume;

        console.log('📈 UPDATE Candle:', updatedCandle, 'Price:', tick.price);
        
        // ═══════════════════════════════════════════════════════════
        // 🛠️ FINAL FIX: Bypass Zustand to prevent re-render
        // ═══════════════════════════════════════════════════════════
        // Mutate arrays in place WITHOUT calling set()
        // This prevents Zustand from notifying subscribers
        historicalData[historicalData.length - 1] = updatedCandle;
        if (updatedVolume && volumeData) {
          volumeData[volumeData.length - 1] = updatedVolume;
        }
        
        // Update livePrice directly on state object
        const state = get();
        state.livePrice = tick.price;
        
        // ═══════════════════════════════════════════════════════════
        // 🎯 CRITICAL: Trigger chart update via ChartController
        // ═══════════════════════════════════════════════════════════
        // This is the high-performance path used by professional trading platforms
        const controller = chartRegistry.get(chartSymbol);
        if (controller) {
          controller.updateCandle(updatedCandle as any);
        }
    }
  },
});
