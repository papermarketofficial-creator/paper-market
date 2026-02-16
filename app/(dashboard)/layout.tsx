'use client';

import DashboardLayoutClient from '@/components/layout/DashboardLayoutClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-theme="terminal" className="bg-background min-h-screen text-foreground font-sans ">
      <QueryClientProvider client={queryClient}>
        <DashboardLayoutClient>{children}</DashboardLayoutClient>
      </QueryClientProvider>
    </div>
  );
}
