import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Position } from '@/types/position.types';
import { dummyPositions } from '@/content/positions';
import { isExpired } from '@/lib/expiry-utils';
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

export const usePositionsStore = create<PositionsState>()(
  persist(
    (set, get) => ({
      positions: dummyPositions,

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

            let exitTrigger: 'STOP_LOSS' | 'TARGET' | null = null;
            if (position.side === 'BUY') {
              if (position.stopLoss && newPrice <= position.stopLoss) exitTrigger = 'STOP_LOSS';
              else if (position.target && newPrice >= position.target) exitTrigger = 'TARGET';
            } else {
              if (position.stopLoss && newPrice >= position.stopLoss) exitTrigger = 'STOP_LOSS';
              else if (position.target && newPrice <= position.target) exitTrigger = 'TARGET';
            }

            if (exitTrigger) {
              setTimeout(() => {
                useTradeExecutionStore.getState().closePosition(
                  position.id,
                  exitTrigger === 'STOP_LOSS' ? position.stopLoss! : position.target!,
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

      reset: () => set({ positions: dummyPositions }),
    }),
    {
      name: 'paper-market-positions',
      storage: createJSONStorage(() => localStorage),
    }
  )
);