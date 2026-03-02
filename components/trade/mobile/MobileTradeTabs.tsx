"use client";

import { cn } from "@/lib/utils";

type MobileTabItem = {
  id: string;
  label: string;
};

type MobileTradeTabsProps = {
  tabs: MobileTabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
};

export function MobileTradeTabs({ tabs, activeTab, onTabChange, className }: MobileTradeTabsProps) {
  return (
    <div
      className={cn(
        "border-t border-white/[0.08] bg-[#0d1422] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2",
        className,
      )}
    >
      <div className="grid grid-flow-col auto-cols-fr gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "min-h-11 rounded-lg px-2 py-2 text-xs font-semibold transition-colors",
                isActive
                  ? "bg-[#2d6cff]/20 text-[#8fb3ff]"
                  : "bg-white/[0.03] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type { MobileTabItem };

