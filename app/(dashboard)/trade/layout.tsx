"use client";

import { useMarketStream } from "@/hooks/use-market-stream";
import '@/lib/trading/init-realtime'; // ✅ Initialize Client TickBus → CandleEngine wiring
import { TradeEngine } from "@/components/trade/TradeEngine";

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  // ✅ Initialize SSE market stream connection
  const { isConnected } = useMarketStream();
  
  return (
    <div className="space-y-6">
      {/* Page Header */}

      {/* Page Content */}
      <TradeEngine />
      <main>{children}</main>
    </div>
  );
}