import { Stock } from '@/types/equity.types';
import { MarketSlice } from '../types';
import { chartRegistry } from '@/lib/trading/chart-registry';
import { candleEngine } from '@/lib/trading/candle-engine';

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

      const updateList = (list: Stock[]) => {
        const index = list.findIndex((item) => item.symbol === symbol);
        if (index < 0) return list;
        const next = [...list];
        next[index] = updateStock(list[index]);
        return next;
      };

      // Debug only indices if needed
      const isIndex = symbol.includes('NIFTY') || symbol.includes('SENSEX');
      if (isIndex && process.env.NODE_ENV === 'development') {
          console.log(`🆙 Updating Index ${symbol}: ${price} (${close})`);
      }

      let stocksBySymbol = state.stocksBySymbol;
      if (stocksBySymbol?.[symbol]) {
        stocksBySymbol = {
          ...stocksBySymbol,
          [symbol]: updateStock(stocksBySymbol[symbol]),
        };
      }

      return {
        stocksBySymbol,
        stocks: updateList(state.stocks),
        futures: updateList(state.futures),
        options: updateList(state.options),
        indices: updateList(state.indices),
        livePrice: price
      };
    });
  },

  updateLiveCandle: (tick: { price: number; volume?: number; time: number }, symbol: string) => {
    const { historicalData, volumeData, simulatedSymbol, activeInterval } = get();
    
    // Normalize symbols for comparison (remove exchange prefix if present)
    const normalizeSymbol = (s: string) => {
      if (!s) return '';
      // Remove exchange prefix variants: NSE_EQ:ITC, NSE_EQ|ITC, etc.
      return s.replace(/^[A-Z_]+[:|]/, '');
    };
    
    const tickSymbol = normalizeSymbol(symbol);
    const chartSymbol = normalizeSymbol(simulatedSymbol || '');
    
    // 🔥 HARD GUARD: Silently reject cross-symbol ticks
    if (tickSymbol !== chartSymbol) {
        return;
    }

    if (!historicalData || historicalData.length === 0) return;

    // ═══════════════════════════════════════════════════════════
    // 🏭 ONE WRITER RULE: Delegate to CandleEngine
    // ═══════════════════════════════════════════════════════════
    // Convert activeInterval to seconds
    const intervalMap: Record<string, number> = {
        '1m': 60,
        '5m': 300,
        '15m': 900,
        '30m': 1800,
        '1h': 3600,
        '1d': 86400
    };
    
    const intervalSeconds = intervalMap[activeInterval] || 60;
    
    // Process tick through CandleEngine (THE ONLY candle creator)
    const normalizedTick = {
        symbol: chartSymbol,
        price: tick.price,
        volume: tick.volume || 0,
        timestamp: tick.time, // Already in seconds
        exchange: 'NSE' // Default exchange
    };
    
    const candleUpdate = candleEngine.processTick(normalizedTick, intervalSeconds);
    
    if (!candleUpdate) {
        // Stale tick or invalid - engine rejected it
        return;
    }

    // ═══════════════════════════════════════════════════════════
    // ✅ IMMUTABLE STATE UPDATES: No mutations allowed
    // ═══════════════════════════════════════════════════════════
    if (candleUpdate.type === 'new') {
        console.log('📝 NEW Candle:', candleUpdate.candle, 'Total candles:', historicalData.length + 1);
        
        // ✅ CORRECT: Immutable array update
        set(state => ({
            historicalData: [...state.historicalData, candleUpdate.candle],
            livePrice: tick.price
        }));
        
        // Trigger ChartController update
        const controller = chartRegistry.get(chartSymbol);
        if (controller) {
          controller.updateCandle(candleUpdate.candle as any);
        }
        
    } else {
        // Update existing candle
        // console.log('📈 UPDATE Candle:', candleUpdate.candle, 'Price:', tick.price);
        
        // ✅ CORRECT: Immutable array update (replace last element)
        set(state => ({
            historicalData: [
                ...state.historicalData.slice(0, -1),
                candleUpdate.candle
            ],
            livePrice: tick.price
        }));
        
        // Trigger ChartController update
        const controller = chartRegistry.get(chartSymbol);
        if (controller) {
          controller.updateCandle(candleUpdate.candle as any);
        }
    }
  },
});
