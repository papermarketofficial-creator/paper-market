
"use client";

import { PositionsTable } from '@/components/positions/PositionsTable';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { useEffect } from 'react';

export default function PositionsPage() {
  const positions = usePositionsStore((state) => state.positions);

  /* Legacy Simulation Removed - Updates handled by useMarketStream via DashboardLayout */

  // Subscribe to market feed for all position symbols
  useEffect(() => {
    if (positions.length > 0) {
      const symbols = positions.map(p => p.symbol);
      
      // Subscribe to market feed for these symbols
      fetch('/api/v1/market/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols })
      }).catch(err => console.error('Failed to subscribe to position symbols:', err));
    }
  }, [positions.map(p => p.symbol).join(',')]);

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


