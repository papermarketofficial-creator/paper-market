"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type TradingLayoutProps = {
  header: ReactNode;
  chain: ReactNode;
  panel: ReactNode;
  bottomBar: ReactNode;
  hasPanelContent: boolean;
};

/**
 * Professional 3-Panel trading terminal layout.
 * - Header: compact top strip (symbol, expiry, mode)
 * - Chain: scrollable option chain (hero element, always full-height)
 * - Panel: right context panel (empty state → selected contract order form)
 * - BottomBar: collapsible positions/orders drawer
 */
export function TradingLayout({
  header,
  chain,
  panel,
  bottomBar,
  hasPanelContent,
}: TradingLayoutProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#080c16]">
      {/* ── TOP STRIP ── */}
      <div className="shrink-0 border-b border-white/[0.06]">{header}</div>

      {/* ── MAIN BODY ── */}
      <div className="flex min-h-0 flex-1">
        {/* Center: Option Chain */}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col overflow-hidden transition-all duration-300",
          )}
        >
          {chain}
        </div>

        {/* Right: Context Panel */}
        <div
          className={cn(
            "hidden shrink-0 border-l border-white/[0.06] xl:flex xl:flex-col",
            hasPanelContent ? "xl:w-[340px]" : "xl:w-[300px]",
            "transition-all duration-300",
          )}
        >
          {panel}
        </div>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div className="shrink-0 border-t border-white/[0.06]">{bottomBar}</div>

      {/* Mobile: slide-up panel when contract selected */}
      {hasPanelContent && (
        <div className="fixed inset-x-0 bottom-0 z-50 xl:hidden">
          <div className="max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-white/[0.1] bg-[#0d1422] shadow-2xl">
            {panel}
          </div>
        </div>
      )}
    </div>
  );
}
