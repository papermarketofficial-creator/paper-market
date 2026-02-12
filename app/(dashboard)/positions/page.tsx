
"use client";

import { PositionsTable } from '@/components/positions/PositionsTable';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { useEffect, useMemo } from 'react';

export default function PositionsPage() {
  const positions = usePositionsStore((state) => state.positions);
  const symbolsKey = useMemo(() => {
    const uniqueSymbols = Array.from(new Set(positions.map((p) => p.symbol)));
    return uniqueSymbols.sort().join(',');
  }, [positions]);


  // Subscribe to market feed for all position symbols
  useEffect(() => {
    if (!symbolsKey) return;
    const symbols = symbolsKey.split(',');

    fetch('/api/v1/market/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols })
    }).catch(err => console.error('Failed to subscribe to position symbols:', err));

    return () => {
      fetch('/api/v1/market/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols })
      }).catch(err => console.error('Failed to unsubscribe position symbols:', err));
    };
  }, [symbolsKey]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Positions</h1>
          <p className="text-muted-foreground">Monitor and manage your open trades</p>
        </div>
      </div>

      {/* Positions Table */}
      <PositionsTable />
    </div>
  );
};


