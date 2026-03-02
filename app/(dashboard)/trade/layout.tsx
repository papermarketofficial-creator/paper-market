"use client";

import { ReactNode } from "react";

export default function TradeLayout({ children }: { children: ReactNode }) {
 

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      {children}
    </div>
  );
}
