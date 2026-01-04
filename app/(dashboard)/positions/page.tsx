"use client";
import { PositionsTable } from '@/components/positions/PositionsTable';

const PositionsPage = () => {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Positions</h1>
        <p className="text-muted-foreground">Monitor and manage your open trades</p>
      </div>

      {/* Positions Table */}
      <PositionsTable />
    </div>
  );
};

export default PositionsPage;
