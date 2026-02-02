import { ReactNode } from 'react';
import DashboardLayoutClient from '@/components/layout/DashboardLayoutClient';
import { MarketStreamProvider } from '@/contexts/MarketStreamContext';



export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-theme="terminal" className="bg-background min-h-screen text-foreground font-sans selection:bg-trade-buy/30">
      {/* 🔥 CRITICAL: Single SSE connection for entire dashboard */}
      <MarketStreamProvider>
        <DashboardLayoutClient>{children}</DashboardLayoutClient>
      </MarketStreamProvider>
    </div>
  );
}
