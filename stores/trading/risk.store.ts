import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface EquityPoint {
  time: number;
  value: number;
}

const INITIAL_BALANCE = 100000;

interface RiskState {
  // Balance is now managed by useWalletStore
  equityHistory: EquityPoint[];
  // Actions
  addEquityPoint: (time: number, value: number) => void;
  reset: () => void;
}

export const useRiskStore = create<RiskState>()(
  persist(
    (set) => ({
      // Balance removed
      equityHistory: [{ time: Date.now(), value: INITIAL_BALANCE }],

      addEquityPoint: (time, value) =>
        set((state) => ({
          equityHistory: [...state.equityHistory, { time, value }],
        })),

      reset: () => set({
        equityHistory: [{ time: Date.now(), value: INITIAL_BALANCE }]
      }),
    }),
    {
      name: 'paper-market-risk',
      storage: createJSONStorage(() => localStorage),
    }
  )
);