"use client";

import { ReactNode } from "react";

export default function TradeLayout({ children }: { children: ReactNode }) {
 

  return (
    <div className="relative h-full">
      {children}
    </div>
  );
}