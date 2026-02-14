
"use client";

import { PositionsTable } from '@/components/positions/PositionsTable';

export default function PositionsPage() {
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


