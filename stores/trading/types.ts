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
  lastPrice: string;
  lotSize: number;
  exchange: string;
  segment: string;
}

// ─────────────────────────────────────────────────────────────────
// 🍕 Slice Interfaces
// ─────────────────────────────────────────────────────────────────

export interface WatchlistSlice {
  // State
  stocks: Stock[];
  instruments: WatchlistInstrument[];
  watchlists: Watchlist[];
  activeWatchlistId: string | null;
  isFetchingWatchlistData: boolean;
  
  // Legacy
  futures: Stock[];
  options: Stock[];
  indices: Stock[];

  // API State
  searchResults: Stock[];
  isSearching: boolean;

  // Actions
  fetchWatchlists: () => Promise<void>;
  fetchInstruments: () => Promise<void>;
  fetchWatchlistInstruments: (watchlistId: string) => Promise<void>;
  createWatchlist: (name: string) => Promise<void>;
  addToWatchlist: (instrument: Stock) => Promise<void>;
  removeFromWatchlist: (instrumentToken: string) => Promise<void>;
  prefetchInstrument: (instrumentKey: string) => void;
  setActiveWatchlist: (watchlistId: string) => void;
  getCurrentInstruments: (mode: InstrumentMode | 'indices') => Stock[];
  searchInstruments: (query: string, type?: string) => Promise<void>;
}

export interface ChartDataSlice {
  // State
  historicalData: any[]; // CandlestickData[]
  volumeData: any[];    // HistogramData[]
  simulatedSymbol: string | null;
  intervalId: NodeJS.Timeout | null;
  activeInterval: string;
  isFetchingHistory: boolean;
  hasMoreHistory: boolean;

  // Actions
  initializeSimulation: (symbol: string, timeframe?: string, range?: string) => Promise<void>;
  startSimulation: () => void;
  stopSimulation: () => void;
  fetchMoreHistory: (symbol: string, range: string, endTime: number) => Promise<void>;
}

export interface LiveUpdatesSlice {
  // State
  livePrice: number;
  optionChain: { underlying: string; underlyingPrice?: number; expiry?: string; strikes: any[] } | null;
  isFetchingChain: boolean;

  // Actions
  updateStockPrice: (symbol: string, price: number, close?: number) => void;
  updateLiveCandle: (tick: { price: number; volume?: number; time: number }, symbol: string) => void;
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
