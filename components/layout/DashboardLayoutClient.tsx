'use client';
import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { cn } from '@/lib/utils';
import { useMarketSimulation } from '@/hooks/use-market-simulation';
import { useTradeExecutionStore } from '@/stores/trading/tradeExecution.store';

export default function DashboardLayoutClient({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 1. Activate Market Simulation (The "Game Loop" that moves prices)
  useMarketSimulation();

  // 2. Check and settle expired positions immediately on mount
  const settleExpiredPositions = useTradeExecutionStore((state) => state.settleExpiredPositions);

  useEffect(() => {
    settleExpiredPositions();
  }, [settleExpiredPositions]);

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className={cn('flex-1 flex flex-col transition-all duration-300', sidebarCollapsed ? 'ml-16' : 'ml-64')}>
        <Topbar />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}