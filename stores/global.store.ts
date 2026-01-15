import { create } from 'zustand';
import { InstrumentType } from '@/components/trade/form/InstrumentSelector';

interface GlobalState {
    // Navigation Context
    selectedSymbol: InstrumentType;
    setSelectedSymbol: (symbol: InstrumentType) => void;

    // Market Simulator State
    isMarketOpen: boolean;
    setMarketOpen: (isOpen: boolean) => void;

    // Ticker Data (Simulated)
    indices: {
        NIFTY: number;
        BANKNIFTY: number;
        SENSEX: number;
    };
    setIndices: (indices: Partial<{ NIFTY: number; BANKNIFTY: number; SENSEX: number }>) => void;
}

export const useGlobalStore = create<GlobalState>((set) => ({
    selectedSymbol: "NIFTY",
    setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

    isMarketOpen: true,
    setMarketOpen: (isOpen) => set({ isMarketOpen: isOpen }),

    indices: {
        NIFTY: 22450.00,
        BANKNIFTY: 47800.00,
        SENSEX: 74200.00,
    },
    setIndices: (newIndices) => set((state) => ({ indices: { ...state.indices, ...newIndices } })),
}));
