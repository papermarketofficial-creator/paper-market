'use client';

import { ReactNode } from 'react';
import DashboardLayoutClient from '@/components/layout/DashboardLayoutClient';
import { MarketStreamProvider } from '@/contexts/MarketStreamContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-theme="terminal" className="bg-background min-h-screen text-foreground font-sans selection:bg-trade-buy/30">
      {/* 🔥 CRITICAL: TanStack Query for smart caching */}
      <QueryClientProvider client={queryClient}>
        {/* 🔥 CRITICAL: Single SSE connection for entire dashboard */}
        <MarketStreamProvider>
          <DashboardLayoutClient>{children}</DashboardLayoutClient>
        </MarketStreamProvider>
      </QueryClientProvider>
    </div>
  );
}
