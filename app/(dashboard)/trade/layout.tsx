"use client";

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Trade</h1>
        <p className="text-muted-foreground">Execute simulated trades on NSE instruments</p>
      </div>

      {/* Page Content */}
      <main>{children}</main>
    </div>
  );
}