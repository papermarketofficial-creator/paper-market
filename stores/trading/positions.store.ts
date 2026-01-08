import { create } from 'zustand';
import { Position } from '@/types/position.types';
import { dummyPositions } from '@/content/positions';
import { isExpired } from '@/lib/expiry-utils';
// We don't import the hook directly to avoid initialization loop
// Instead we will rely on accessing the store instance inside the function
import { useTradeExecutionStore } from './tradeExecution.store';

interface PositionsState {
  positions: Position[];
  // Actions
  updatePositionPrice: (positionId: string, newPrice: number) => void;
  addPosition: (position: Position) => void;
  removePosition: (positionId: string) => void;
  updateAllPositionsPrices: (priceUpdates: { [symbol: string]: number }) => void;
  simulatePriceUpdates: () => void;
  getExpiredPositions: () => Position[];
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
  positions: dummyPositions,

  updatePositionPrice: (positionId, newPrice) => {
    // ... existing ...
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

  addPosition: (position) => {
    const initialPnL = calculatePnL(position, position.currentPrice);
    set((state) => ({
      positions: [...state.positions, { ...position, currentPnL: initialPnL }],
    }));
  },

  removePosition: (positionId) => {
    set((state) => ({
      positions: state.positions.filter((p) => p.id !== positionId),
    }));
  },

  updateAllPositionsPrices: (priceUpdates) => {
    // ... existing ...
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

  simulatePriceUpdates: () => {
    set((state) => {
      const updatedPositions = state.positions.map((position) => {
        const volatility = position.instrument === 'options' ? 0.015 : 0.005;
        const changePercent = (Math.random() - 0.5) * volatility;
        const newPrice = position.currentPrice * (1 + changePercent);
        const pnl = calculatePnL(position, newPrice);
        
        // ✅ NEW: Auto-Exit Logic (SL/Target)
        // We perform the check here but trigger the close ACTION outside the map 
        // to avoid side-effects during render/set. 
        // Actually, we can just return the updated position here 
        // and handle closing in a separate pass or effect.
        // However, for simplicity in this "simulation loop", we will trigger it immediately.
        
        let exitTrigger: 'STOP_LOSS' | 'TARGET' | null = null;

        if (position.side === 'BUY') {
          if (position.stopLoss && newPrice <= position.stopLoss) exitTrigger = 'STOP_LOSS';
          else if (position.target && newPrice >= position.target) exitTrigger = 'TARGET';
        } else {
          // SELL side
          if (position.stopLoss && newPrice >= position.stopLoss) exitTrigger = 'STOP_LOSS';
          else if (position.target && newPrice <= position.target) exitTrigger = 'TARGET';
        }

        if (exitTrigger) {
          // ⚠️ Trigger Close asynchronously to avoid state conflict during map
          setTimeout(() => {
            useTradeExecutionStore.getState().closePosition(
              position.id, 
              exitTrigger === 'STOP_LOSS' ? position.stopLoss! : position.target!, // Close at trigger price
              exitTrigger
            );
          }, 0);
        }

        return { ...position, currentPrice: newPrice, currentPnL: pnl };
      });

      return { positions: updatedPositions };
    });
  },

  getExpiredPositions: () => {
    const { positions } = get();
    return positions.filter((p) => 
      p.instrument !== 'equity' && 
      p.expiryDate && 
      isExpired(p.expiryDate)
    );
  },
}));