import { create } from 'zustand';
import { EquityPoint } from '@/types/pnl.types';
import { generateEquityHistory } from '@/content/charts';

const INITIAL_BALANCE = 1000000; // ₹10,00,000

interface RiskState {
  balance: number;
  equityHistory: EquityPoint[];
  // Actions
  deductMargin: (amount: number) => void;
  addToBalance: (amount: number) => void;
  addEquityPoint: (time: number, value: number) => void;
  resetBalance: () => void;
}

export const useRiskStore = create<RiskState>((set, get) => ({
  balance: INITIAL_BALANCE,
  equityHistory: generateEquityHistory(),

  deductMargin: (amount) => {
    set((state) => ({
      balance: state.balance - amount,
    }));
  },

  addToBalance: (amount) => {
    set((state) => ({
      balance: state.balance + amount,
    }));
  },

  addEquityPoint: (time, value) => {
    set((state) => ({
      equityHistory: [
        ...state.equityHistory,
        { time, value },
      ],
    }));
  },

  resetBalance: () => {
    set({
      balance: INITIAL_BALANCE,
      equityHistory: generateEquityHistory(),
    });
  },
}));