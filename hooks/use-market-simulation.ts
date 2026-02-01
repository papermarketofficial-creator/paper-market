// hooks/use-market-simulation.ts
import { useEffect } from 'react';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { useMarketStore } from '@/stores/trading/market.store';

export const useMarketSimulation = () => {
  const { updateAllPositionsPrices, positions } = usePositionsStore();

  // In a real app, this would come from a websocket
  // For now, we'll just simulate small price movements on the client side
  // to keep the PnL alive

  useEffect(() => {
    if (positions.length === 0) return;

    const intervalId = setInterval(() => {
      const updates: { [symbol: string]: number } = {};

      positions.forEach(position => {
        const volatility = position.instrument === 'options' ? 0.002 : 0.0005;
        const changePercent = (Math.random() - 0.5) * volatility;
        const newPrice = position.currentPrice * (1 + changePercent);
        updates[position.symbol] = newPrice;
      });

      updateAllPositionsPrices(updates);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [positions, updateAllPositionsPrices]); // Re-bind when positions change to catch new symbols
};