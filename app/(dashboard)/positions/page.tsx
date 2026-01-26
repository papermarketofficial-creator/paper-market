"use client";
import { useEffect } from 'react';
import { PositionsTable } from '@/components/positions/PositionsTable';
import { Button } from '@/components/ui/button';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { RefreshCw } from 'lucide-react';

const PositionsPage = () => {
  /* Legacy Simulation Removed - Updates handled by useMarketStream via DashboardLayout */

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

export default PositionsPage;
