import { MarketSlice, Quote } from "../types";
import { chartRegistry } from "@/lib/trading/chart-registry";
import { candleEngine } from "@/lib/trading/candle-engine";
import { toCanonicalSymbol, toInstrumentKey, toSymbolKey } from "@/lib/market/symbol-normalization";

const toFiniteNumber = (value: unknown): number =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

function buildQuoteFromTick(
  previousQuote: Quote | undefined,
  tick: { instrumentKey: string; symbol?: string; price: number; close?: number; timestamp?: number }
): Quote | null {
  const instrumentKey = toInstrumentKey(tick.instrumentKey || tick.symbol || "");
  const canonicalSymbol = toCanonicalSymbol(tick.symbol || "");
  const price = toFiniteNumber(tick.price);
  if (!instrumentKey || price <= 0) return null;

  const previousClose =
    previousQuote && Number.isFinite(previousQuote.close) && previousQuote.close > 0
      ? previousQuote.close
      : 0;

  const incomingClose = toFiniteNumber(tick.close);
  const close = incomingClose > 0 ? incomingClose : previousClose;
  const change = close > 0 ? price - close : 0;
  const changePercent = close > 0 ? (change / close) * 100 : 0;

  return {
    instrumentKey,
    symbol: canonicalSymbol || previousQuote?.symbol,
    key: instrumentKey,
    price,
    close,
    change,
    changePercent,
    timestamp:
      Number.isFinite(tick.timestamp) && Number(tick.timestamp) > 0
        ? Number(tick.timestamp)
        : Date.now(),
  };
}

export const createLiveUpdatesSlice: MarketSlice<any> = (set, get) => ({
  livePrice: 0,
  quotesByInstrument: {},
  quotesByKey: {},
  optionChain: null,
  isFetchingChain: false,

  fetchOptionChain: async (symbol: string, expiry?: string) => {
    set({ isFetchingChain: true });
    try {
      const expiryParam = expiry ? `&expiry=${expiry}` : "";
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

  applyTick: (tick: { instrumentKey: string; symbol?: string; price: number; close?: number; timestamp?: number }) => {
    set((state: any) => {
      const seed = buildQuoteFromTick(undefined, tick);
      if (!seed) return state;
      const nextQuote = buildQuoteFromTick(state.quotesByInstrument[seed.instrumentKey], tick);
      if (!nextQuote) return state;
      const nextQuotesByInstrument = {
        ...state.quotesByInstrument,
        [nextQuote.instrumentKey]: nextQuote,
      };

      return {
        quotesByInstrument: nextQuotesByInstrument,
        quotesByKey: nextQuotesByInstrument,
        livePrice: nextQuote.price,
      };
    });
  },

  hydrateQuotes: (
    quotes: Array<{ instrumentKey: string; symbol?: string; price: number; close?: number; timestamp?: number }>
  ) => {
    if (!Array.isArray(quotes) || quotes.length === 0) return;

    set((state: any) => {
      const nextByKey: Record<string, Quote> = { ...state.quotesByInstrument };
      let latestPrice = state.livePrice;

      for (const tick of quotes) {
        const seed = buildQuoteFromTick(undefined, tick);
        if (!seed) continue;
        const nextQuote = buildQuoteFromTick(nextByKey[seed.instrumentKey], tick);
        if (!nextQuote) continue;
        nextByKey[nextQuote.instrumentKey] = nextQuote;
        latestPrice = nextQuote.price;
      }

      return {
        quotesByInstrument: nextByKey,
        quotesByKey: nextByKey,
        livePrice: latestPrice,
      };
    });
  },

  selectQuote: (instrumentKeyOrSymbol: string) => {
    const instrumentKey = toInstrumentKey(instrumentKeyOrSymbol);
    if (instrumentKey) {
      const byInstrument = get().quotesByInstrument[instrumentKey];
      if (byInstrument) return byInstrument;
    }

    const symbolKey = toSymbolKey(toCanonicalSymbol(instrumentKeyOrSymbol));
    if (!symbolKey) return null;
    const allQuotes = Object.values(get().quotesByInstrument) as Quote[];
    return (
      allQuotes.find((quote) => toSymbolKey(toCanonicalSymbol(quote.symbol || "")) === symbolKey) || null
    );
  },

  selectPrice: (instrumentKeyOrSymbol: string) => {
    const quote = get().selectQuote(instrumentKeyOrSymbol);
    return quote?.price ?? 0;
  },

  // Backward-compatible wrapper. New SSE flow should call applyTick directly.
  updateStockPrice: (symbol: string, price: number, close?: number) => {
    get().applyTick({
      instrumentKey: symbol,
      symbol,
      price,
      close,
      timestamp: Date.now(),
    });
  },

  updateLiveCandle: (
    tick: { price: number; volume?: number; time: number },
    symbol: string,
    instrumentKey?: string
  ) => {
    const { historicalData, simulatedSymbol, simulatedInstrumentKey, activeInterval } = get();

    const normalizeForChart = (value: string) =>
      toCanonicalSymbol(String(value || "").replace(/^[A-Z_]+[:|]/, ""));

    const tickSymbol = normalizeForChart(symbol);
    const chartSymbol = normalizeForChart(simulatedSymbol || "");
    const tickKey = toInstrumentKey(instrumentKey || symbol);
    const chartKey = toInstrumentKey(simulatedInstrumentKey || simulatedSymbol || "");

    if (!chartKey || !tickKey || tickKey !== chartKey) {
      const tickSymbolKey = toSymbolKey(tickSymbol);
      const chartSymbolKey = toSymbolKey(chartSymbol);
      if (!tickSymbolKey || !chartSymbolKey || tickSymbolKey !== chartSymbolKey) {
        return;
      }
    }

    if (!historicalData || historicalData.length === 0) return;

    const intervalMap: Record<string, number> = {
      "1m": 60,
      "5m": 300,
      "15m": 900,
      "30m": 1800,
      "1h": 3600,
      "1d": 86400,
    };

    const intervalSeconds = intervalMap[activeInterval] || 60;

    const normalizedTick = {
      instrumentKey: chartKey,
      symbol: chartSymbol,
      price: tick.price,
      volume: tick.volume || 0,
      timestamp: tick.time,
      exchange: "NSE",
    };

    const candleUpdate = candleEngine.processTick(normalizedTick, intervalSeconds);
    if (!candleUpdate) {
      return;
    }

    if (candleUpdate.type === "new") {
      set((state: any) => ({
        historicalData: [...state.historicalData, candleUpdate.candle],
        livePrice: tick.price,
      }));

      const controller = chartRegistry.get(chartKey);
      if (controller) {
        controller.updateCandle(candleUpdate.candle as any);
      }
      return;
    }

    set((state: any) => ({
      historicalData: [...state.historicalData.slice(0, -1), candleUpdate.candle],
      livePrice: tick.price,
    }));

    const controller = chartRegistry.get(chartKey);
    if (controller) {
      controller.updateCandle(candleUpdate.candle as any);
    }
  },
});
