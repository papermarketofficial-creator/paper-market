"use client";

import { ReactNode } from "react";

interface TradeLayoutProps {
  watchlist: ReactNode;
  chart: ReactNode;
  orderForm?: ReactNode; // Optional, can be overlay
}

export function TradeLayout({ watchlist, chart, orderForm }: TradeLayoutProps) {
  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Middle Column: Watchlist (Fixed Width + Resizable logic conceptually) */}
      <div className="w-[320px] md:w-[360px] border-r border-border flex flex-col shrink-0">
        {watchlist}
      </div>

      {/* Right Column: Workspace (Flexible) */}
      <div className="flex-1 flex flex-col relative min-w-0 bg-background/50">
        <div className="flex-1 relative">
          {chart}
        </div>
      </div>

      {/* Order Form Overlay (Absolute or Floating) */}
      {orderForm && (
        <>
           {orderForm}
        </>
      )}
    </div>
  );
}
