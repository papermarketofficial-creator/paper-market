import { StateCreator } from 'zustand';
import { Stock } from '@/types/equity.types';
import { InstrumentMode } from '@/types/general.types';

// ─────────────────────────────────────────────────────────────────
// 📋 Watchlist Types
// ─────────────────────────────────────────────────────────────────
export interface Watchlist {
  id: string;
  name: string;
  isDefault: boolean;
  instrumentCount: number;
}

export interface WatchlistInstrument {
  instrumentToken: string;
  tradingsymbol: string;
  name: string;
  lotSize: number;
  exchange: string;
  segment: string;
}

export interface Quote {
  instrumentKey: string;
  symbol?: string;
  key?: string; // deprecated: use instrumentKey
  price: number;
  close: number;
  change: number;
  changePercent: number;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────
// 🍕 Slice Interfaces
// ─────────────────────────────────────────────────────────────────

export interface WatchlistSlice {
  // State (UI State Only - Data managed by TanStack Query)
  stocks: Stock[];
  stocksBySymbol: Record<string, Stock>;
  instruments: WatchlistInstrument[];
  activeWatchlistId: string | null;
  
  // Legacy
  futures: Stock[];
  options: Stock[];
  indices: Stock[];

  // API State
  searchResults: Stock[];
  isSearching: boolean;

  // Actions (Simplified for TanStack Query)
  setActiveWatchlistId: (watchlistId: string | null) => void;
  setStocks: (stocks: Stock[]) => void;
  updateStockPrices: (priceUpdates: Record<string, number>) => void;
  getCurrentInstruments: (mode: InstrumentMode | 'indices') => Stock[];
  searchInstruments: (query: string, type?: string) => Promise<void>;
}

export interface ChartDataSlice {
  // State
  historicalData: any[]; // CandlestickData[]
  volumeData: any[];    // HistogramData[]
  simulatedSymbol: string | null;
  simulatedInstrumentKey: string | null;
  intervalId: NodeJS.Timeout | null;
  activeInterval: string;
  isFetchingHistory: boolean;
  isInitialLoad: boolean; // 🔥 NEW: Track if this is the first load
  hasMoreHistory: boolean;
  currentRequestId: number; // 🔥 CRITICAL: Prevent stale fetch overwrites

  // Actions
  initializeSimulation: (symbol: string, timeframe?: string, range?: string) => Promise<void>;
  startSimulation: () => void;
  stopSimulation: () => void;
  fetchMoreHistory: (symbol: string, range: string, endTime: number) => Promise<void>;
}

export interface LiveUpdatesSlice {
  // State
  livePrice: number;
  quotesByInstrument: Record<string, Quote>;
  quotesByKey: Record<string, Quote>; // deprecated alias to avoid transition breakage
  optionChain: { underlying: string; underlyingPrice?: number; expiry?: string; strikes: any[] } | null;
  isFetchingChain: boolean;

  // Actions
  applyTick: (tick: {
    instrumentKey: string;
    symbol?: string;
    price: number;
    close?: number;
    timestamp?: number;
  }) => void;
  hydrateQuotes: (quotes: Array<{
    instrumentKey: string;
    symbol?: string;
    price: number;
    close?: number;
    timestamp?: number;
  }>) => void;
  selectQuote: (instrumentKeyOrSymbol: string) => Quote | null;
  selectPrice: (instrumentKeyOrSymbol: string) => number;
  updateStockPrice: (symbol: string, price: number, close?: number) => void;
  updateLiveCandle: (
    tick: { price: number; volume?: number; time: number },
    symbol: string,
    instrumentKey?: string
  ) => void;
  fetchOptionChain: (symbol: string, expiry?: string) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────
// 🏗️ Combined Store Type
// ─────────────────────────────────────────────────────────────────
export type MarketState = WatchlistSlice & ChartDataSlice & LiveUpdatesSlice;

export type MarketSlice<T> = StateCreator<
  MarketState,
  [], 
  [], 
  T
>;
