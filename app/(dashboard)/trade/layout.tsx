"use client";
import { TradeEngine } from "@/components/trade/TradeEngine";

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      {/* Page Header */}


      {/* Page Content */}
      <TradeEngine />
      <main>{children}</main>
    </div>
  );
}