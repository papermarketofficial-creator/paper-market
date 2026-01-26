'use client';
import { ReactNode, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useMarketSimulation } from '@/hooks/use-market-simulation';
import { useWalletStore } from '@/stores/wallet.store';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { useTradeExecutionStore } from '@/stores/trading/tradeExecution.store';
import { useMarketStream } from '@/hooks/use-market-stream'; // New Hook

export default function DashboardLayoutClient({ children }: { children: ReactNode }) {
  // 1. Activate Market Simulation (Legacy - kept as fallback or needs removal)
  useMarketSimulation();

  // 2. Activate Real-Time Stream (Primary)
  useMarketStream();

  // 3. Fetch Initial Data (Wallet & Positions)
  const fetchWallet = useWalletStore((state) => state.fetchWallet);
  const fetchPositions = usePositionsStore((state) => state.fetchPositions);
  // fetchOrders will be added later if needed globally, usually fetched on specific pages

  useEffect(() => {
    fetchWallet();
    fetchPositions();
  }, [fetchWallet, fetchPositions]);

  return (
    <DashboardContentWrapper>
      {children}
    </DashboardContentWrapper>
  );
}

// Internal wrapper to manage state without making the refined Sidebar too complex
// ... imports
import { MarketStatusBar } from '@/components/layout/MarketStatusBar';

// ... (existing code)

function DashboardContentWrapper({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <Sidebar mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />

      <div className="flex-1 flex flex-col md:ml-16 transition-all duration-300">
        <MarketStatusBar />
        <Topbar mobileMenuOpen={mobileMenuOpen} onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden w-full max-w-full">
          {children}
        </main>
      </div>
    </>
  )
}