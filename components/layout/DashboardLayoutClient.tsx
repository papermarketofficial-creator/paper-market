'use client';
import { ReactNode, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';

import { useWalletStore } from '@/stores/wallet.store';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { useMarketStream } from '@/hooks/use-market-stream'; // New Hook
import { MarketStatusBar } from '@/components/layout/MarketStatusBar';

export default function DashboardLayoutClient({ children }: { children: ReactNode }) {
  

  useMarketStream();

  const fetchWallet = useWalletStore((state) => state.fetchWallet);
  const fetchPositions = usePositionsStore((state) => state.fetchPositions);

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



function DashboardContentWrapper({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (

    <div className="flex min-h-screen w-full bg-background text-foreground font-sans selection:bg-trade-buy/30 selection:text-trade-buy">
      <Sidebar mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />

      <div className="flex-1 flex flex-col md:ml-16 transition-all duration-300">
        <MarketStatusBar />

        <main className="flex-1  overflow-x-hidden w-full max-w-full">
          {children}
        </main>
      </div>
    </div>
  )
}