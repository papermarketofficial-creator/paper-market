import { create } from 'zustand';
import { Position } from '@/types/position.types';
import { useTradeExecutionStore } from './tradeExecution.store';
import { toast } from 'sonner';

interface PositionsState {
  positions: Position[];
  isLoading: boolean;
  hasFetched: boolean; 
  error: string | null;

  // Actions
  fetchPositions: (background?: boolean) => Promise<void>;
  closePosition: (positionId: string, quantity?: number) => Promise<boolean>;
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
  hasFetched: false,
  error: null,

  fetchPositions: async (background = false) => {
    if (!background) {
      set({ isLoading: true, error: null });
    }
    try {
      const res = await fetch('/api/v1/positions');
      const data = await res.json();

      if (data.success) {
        const currentPositions = get().positions;
        
        // Preserve live SSE prices as source of truth.
        // Polling is only for structural hydration/recovery.
        const mergedPositions = (data.data || []).map((newPos: Position) => {
          const existingPos = currentPositions.find(p => p.id === newPos.id);

          if (existingPos && existingPos.currentPrice > 0) {
            return {
              ...newPos,
              currentPrice: existingPos.currentPrice,
              currentPnL: existingPos.currentPnL
            };
          }
          
          return newPos;
        });
        
        set({ positions: mergedPositions });
      } else {
        set({ error: data.error || 'Failed to fetch positions' });
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
      set({ error: 'Network error fetching positions' });
    } finally {
       if (!background) {
           set({ isLoading: false , hasFetched: true });
       }
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

  closePosition: async (positionId, quantity) => {
    try {
      const res = await fetch(`/api/v1/positions/${positionId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to close position');
      }

      if (data.success) {
        // Refresh positions to reflect the change
        await get().fetchPositions();
        toast.success('Position Closed', {
          description: data.message || 'Position closed successfully'
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to close position:', error);
      toast.error('Failed to Close Position', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  },

  reset: () =>
  set({
    positions: [],
    error: null,
    isLoading: false,
    hasFetched: false, 
  }),
}));
