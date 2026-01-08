'use client';
import { ReactNode, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useMarketSimulation } from '@/hooks/use-market-simulation';
import { useTradeExecutionStore } from '@/stores/trading/tradeExecution.store';

export default function DashboardLayoutClient({ children }: { children: ReactNode }) {
  // 1. Activate Market Simulation
  useMarketSimulation();

  // 2. Check and settle expired positions on mount
  const settleExpiredPositions = useTradeExecutionStore((state) => state.settleExpiredPositions);

  useEffect(() => {
    settleExpiredPositions();
  }, [settleExpiredPositions]);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar handles its own hover expansion */}
      <Sidebar />
      
      {/* Main Content 
         ml-16 reserves space for the collapsed sidebar.
         When sidebar expands to w-64, it overlays this content (z-50),
         preserving the "Trading Terminal" feel.
      */}
      <div className="flex-1 flex flex-col ml-16 transition-all duration-300">
        <Topbar />
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}