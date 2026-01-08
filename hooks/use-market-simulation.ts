// hooks/use-market-simulation.ts
import { useEffect } from 'react';
import { usePositionsStore } from '@/stores/trading/positions.store';

export const useMarketSimulation = () => {
  const simulatePriceUpdates = usePositionsStore((state) => state.simulatePriceUpdates);

  useEffect(() => {
    // Updates prices every 1 second (1000ms)
    const intervalId = setInterval(() => {
      simulatePriceUpdates();
    }, 1000);

    return () => clearInterval(intervalId);
  }, [simulatePriceUpdates]);
};