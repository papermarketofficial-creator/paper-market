"use client";
import { useEffect } from 'react';
import { PositionsTable } from '@/components/positions/PositionsTable';
import { Button } from '@/components/ui/button';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { RefreshCw } from 'lucide-react';

const PositionsPage = () => {
  const simulatePriceUpdates = usePositionsStore((state) => state.simulatePriceUpdates);

  // Simulate real-time price updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      simulatePriceUpdates();
    }, 5000);

    return () => clearInterval(interval);
  }, [simulatePriceUpdates]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Positions</h1>
          <p className="text-muted-foreground">Monitor and manage your open trades</p>
        </div>
        <Button
          onClick={simulatePriceUpdates}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Update Prices
        </Button>
      </div>

      {/* Positions Table */}
      <PositionsTable />
    </div>
  );
};

export default PositionsPage;
