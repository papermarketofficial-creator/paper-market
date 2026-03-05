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
        "border-t border-border bg-card/95 px-2 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all",
                isActive
                  ? "border border-primary/50 bg-primary/15 text-primary shadow-[0_0_0_1px_rgba(59,130,246,0.2)_inset]"
                  : "border border-border bg-background/70 text-muted-foreground hover:bg-muted hover:text-foreground",
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

