import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface EquityPoint {
  time: number;
  value: number;
}

const INITIAL_BALANCE = 100000;

interface RiskState {
  balance: number;
  equityHistory: EquityPoint[];
  // Actions
  deductMargin: (amount: number) => void;
  addToBalance: (amount: number) => void;
  addEquityPoint: (time: number, value: number) => void;
  reset: () => void;
}

export const useRiskStore = create<RiskState>()(
  persist(
    (set) => ({
      balance: INITIAL_BALANCE,
      equityHistory: [{ time: Date.now(), value: INITIAL_BALANCE }],

      deductMargin: (amount) =>
        set((state) => ({
          balance: state.balance - amount,
        })),

      addToBalance: (amount) =>
        set((state) => ({
          balance: state.balance + amount,
        })),

      addEquityPoint: (time, value) =>
        set((state) => ({
          equityHistory: [...state.equityHistory, { time, value }],
        })),

      reset: () => set({
        balance: INITIAL_BALANCE,
        equityHistory: [{ time: Date.now(), value: INITIAL_BALANCE }]
      }),
    }),
    {
      name: 'paper-market-risk',
      storage: createJSONStorage(() => localStorage),
    }
  )
);