import { create } from 'zustand';
import { Position } from '@/types/position.types';
import { useTradeExecutionStore } from './tradeExecution.store';
import { toast } from 'sonner';

interface PositionsState {
  positions: Position[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchPositions: () => Promise<void>;
  updatePositionPrice: (positionId: string, newPrice: number) => void;
  updateAllPositionsPrices: (priceUpdates: { [symbol: string]: number }) => void;
  reset: () => void;
}

const calculatePnL = (position: Position, currentPrice: number): number => {
  const { instrument, side, entryPrice, lotSize, quantity } = position;
  switch (instrument) {
    case 'futures':
    case 'options': {
      const pnl = (currentPrice - entryPrice) * lotSize * quantity;
      return side === 'BUY' ? pnl : -pnl;
    }
    default: {
      const pnl = (currentPrice - entryPrice) * quantity;
      return side === 'BUY' ? pnl : -pnl;
    }
  }
};

export const usePositionsStore = create<PositionsState>((set, get) => ({
  positions: [],
  isLoading: false,
  error: null,

  fetchPositions: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/v1/positions');
      const data = await res.json();

      if (data.success) {
        set({ positions: data.data });
      } else {
        set({ error: data.error || 'Failed to fetch positions' });
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
      set({ error: 'Network error fetching positions' });
    } finally {
      set({ isLoading: false });
    }
  },

  updatePositionPrice: (positionId, newPrice) => {
    set((state) => ({
      positions: state.positions.map((p) => {
        if (p.id === positionId) {
          const pnl = calculatePnL(p, newPrice);
          return { ...p, currentPrice: newPrice, currentPnL: pnl };
        }
        return p;
      }),
    }));
  },

  updateAllPositionsPrices: (priceUpdates) => {
    set((state) => ({
      positions: state.positions.map((position) => {
        const newPrice = priceUpdates[position.symbol];
        if (newPrice !== undefined && newPrice !== position.currentPrice) {
          const pnl = calculatePnL(position, newPrice);
          return { ...position, currentPrice: newPrice, currentPnL: pnl };
        }
        return position;
      }),
    }));
  },

  reset: () => set({ positions: [], error: null }),
}));
