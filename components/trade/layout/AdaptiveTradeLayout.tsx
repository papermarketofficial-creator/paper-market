"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useTradeViewport } from "@/hooks/use-trade-viewport";
import { MobileTradeTabs, type MobileTabItem } from "@/components/trade/mobile/MobileTradeTabs";

type MobileTab = MobileTabItem & {
  content?: ReactNode;
  keepMounted?: boolean;
  onSelect?: () => void;
};

type AdaptiveTradeLayoutProps = {
  className?: string;
  header?: ReactNode;
  footer?: ReactNode;

  desktopLeft?: ReactNode;
  desktopCenter: ReactNode;
  desktopRight?: ReactNode;
  desktopLeftWidth?: string;
  desktopRightWidth?: string;

  tabletTop?: ReactNode;
  tabletLeft?: ReactNode;
  tabletRight?: ReactNode;

  mobileTopBar?: ReactNode;
  mobileTabs?: MobileTab[];
  mobileDefaultTab?: string;

  mobileOrderDrawer?: ReactNode;
  mobileOrderOpen?: boolean;
  onMobileOrderOpenChange?: (open: boolean) => void;
};

function buildDesktopColumns(left: boolean, right: boolean, leftWidth: string, rightWidth: string): string {
  if (left && right) return `${leftWidth} minmax(0,1fr) ${rightWidth}`;
  if (left) return `${leftWidth} minmax(0,1fr)`;
  if (right) return `minmax(0,1fr) ${rightWidth}`;
  return "minmax(0,1fr)";
}

export function AdaptiveTradeLayout({
  className,
  header,
  footer,
  desktopLeft,
  desktopCenter,
  desktopRight,
  desktopLeftWidth = "360px",
  desktopRightWidth = "340px",
  tabletTop,
  tabletLeft,
  tabletRight,
  mobileTopBar,
  mobileTabs = [],
  mobileDefaultTab,
  mobileOrderDrawer,
  mobileOrderOpen,
  onMobileOrderOpenChange,
}: AdaptiveTradeLayoutProps) {
  const { isMobile, isTablet, isDesktop } = useTradeViewport();

  const contentTabs = useMemo(() => mobileTabs.filter((tab) => Boolean(tab.content)), [mobileTabs]);
  const fallbackTab = mobileDefaultTab || contentTabs[0]?.id || "chart";
  const [activeTab, setActiveTab] = useState(fallbackTab);

  useEffect(() => {
    if (contentTabs.length === 0) return;
    if (contentTabs.some((tab) => tab.id === activeTab)) return;
    setActiveTab(contentTabs[0].id);
  }, [activeTab, contentTabs]);

  const desktopColumns = useMemo(
    () => buildDesktopColumns(Boolean(desktopLeft), Boolean(desktopRight), desktopLeftWidth, desktopRightWidth),
    [desktopLeft, desktopLeftWidth, desktopRight, desktopRightWidth],
  );

  const handleTabChange = (tabId: string) => {
    const selected = mobileTabs.find((tab) => tab.id === tabId);
    if (!selected) return;

    selected.onSelect?.();
    if (selected.content) {
      setActiveTab(tabId);
    }
  };

  const renderDesktop = () => (
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: desktopColumns }}>
      {desktopLeft ? <div className="min-h-0 overflow-hidden border-r border-white/[0.08]">{desktopLeft}</div> : null}
      <div className="min-h-0 overflow-hidden">{desktopCenter}</div>
      {desktopRight ? <div className="min-h-0 overflow-hidden border-l border-white/[0.08]">{desktopRight}</div> : null}
    </div>
  );

  const renderTablet = () => {
    const top = tabletTop ?? desktopCenter;
    const left = tabletLeft ?? desktopLeft;
    const right = tabletRight ?? desktopRight;

    return (
      <div className="grid h-full min-h-0 grid-rows-[minmax(0,56%)_minmax(0,44%)]">
        <div className="min-h-0 overflow-hidden border-b border-white/[0.08]">{top}</div>

        {left && right ? (
          <div className="grid min-h-0 grid-cols-2">
            <div className="min-h-0 overflow-hidden border-r border-white/[0.08]">{left}</div>
            <div className="min-h-0 overflow-hidden">{right}</div>
          </div>
        ) : (
          <div className="min-h-0 overflow-hidden">{left || right || desktopCenter}</div>
        )}
      </div>
    );
  };

  const renderMobile = () => (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {mobileTopBar ? <div className="shrink-0">{mobileTopBar}</div> : null}

      <div className="relative flex-1 min-h-0 overflow-hidden">
        {mobileTabs.map((tab) => {
          if (!tab.content) return null;
          const isActive = activeTab === tab.id;

          if (tab.keepMounted) {
            return (
              <section
                key={tab.id}
                className={cn(
                  "absolute inset-0 min-h-0",
                  isActive ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
                )}
                aria-hidden={!isActive}
              >
                {tab.content}
              </section>
            );
          }

          if (!isActive) return null;
          return (
            <section key={tab.id} className="absolute inset-0 min-h-0">
              {tab.content}
            </section>
          );
        })}
      </div>

      <MobileTradeTabs
        tabs={mobileTabs.map((tab) => ({ id: tab.id, label: tab.label }))}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {mobileOrderDrawer ? (
        <Drawer open={Boolean(mobileOrderOpen)} onOpenChange={onMobileOrderOpenChange}>
          <DrawerContent className="max-h-[88vh] min-h-0 border-white/[0.12] bg-[#0d1422] p-0">
            {mobileOrderDrawer}
          </DrawerContent>
        </Drawer>
      ) : null}
    </div>
  );

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden bg-[#080c16]", className)}>
      {header ? <div className="shrink-0 border-b border-white/[0.08]">{header}</div> : null}
      <div className="flex-1 min-h-0 overflow-hidden">{isDesktop ? renderDesktop() : isTablet ? renderTablet() : renderMobile()}</div>
      {footer && !isMobile ? <div className="shrink-0 border-t border-white/[0.08]">{footer}</div> : null}
    </div>
  );
}

export type { MobileTab };

