"use client";

import { ReactNode } from "react";
import { useMarketStreamStatus } from "@/contexts/MarketStreamContext";

export default function TradeLayout({ children }: { children: ReactNode }) {
  // 🔥 CRITICAL: Only consume status, don't create connection
  const { status } = useMarketStreamStatus();

  return (
    <div className="relative h-full">
      {/* Optional: connection status indicator */}
      {status === 'connecting' && (
        <div className="absolute top-2 right-2 z-50 px-2 py-1 bg-yellow-500/20 text-yellow-500 text-xs rounded">
          Connecting to market feed...
        </div>
      )}
      {status === 'error' && (
        <div className="absolute top-2 right-2 z-50 px-2 py-1 bg-red-500/20 text-red-500 text-xs rounded">
          Market feed error
        </div>
      )}
      {children}
    </div>
  );
}