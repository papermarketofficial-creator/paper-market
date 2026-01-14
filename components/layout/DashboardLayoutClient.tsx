'use client';
import { ReactNode, useEffect, useState } from 'react';
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
    <DashboardContentWrapper>
      {children}
    </DashboardContentWrapper>
  );
}

// Internal wrapper to manage state without making the refined Sidebar too complex
function DashboardContentWrapper({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <Sidebar mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />

      <div className="flex-1 flex flex-col md:ml-16 transition-all duration-300">
        <Topbar mobileMenuOpen={mobileMenuOpen} onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden w-full max-w-full">
          {children}
        </main>
      </div>
    </>
  )
}