import { ReactNode } from 'react';
import DashboardLayoutClient from '@/components/layout/DashboardLayoutClient';



export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-theme="terminal" className="bg-background min-h-screen text-foreground font-sans selection:bg-trade-buy/30">
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </div>
  );
}
