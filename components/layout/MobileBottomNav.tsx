"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Home, List, History, Briefcase, Settings } from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "List", href: "/trade/equity", icon: List },
  { label: "Orders", href: "/orders", icon: History },
  { label: "Portfolio", href: "/positions", icon: Briefcase },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-2 left-1/2 z-50 flex h-16 w-[calc(100%-0.9rem)] max-w-md -translate-x-1/2 items-center justify-around rounded-2xl border border-border bg-background/95 px-1 shadow-[0_10px_28px_rgba(15,23,42,0.16)] backdrop-blur md:hidden pb-[env(safe-area-inset-bottom)] dark:border-white/[0.08] dark:bg-[#0b1220]/95 dark:shadow-[0_14px_35px_rgba(0,0,0,0.45)]">
      {NAV_ITEMS.map((item) => {
        // Consider it active if pathname starts with href (except for exact matching needed for /dashboard or /)
        const isActive = pathname === item.href || (item.href !== "/" && item.href !== "/dashboard" && pathname?.startsWith(item.href));
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl px-1 py-1 transition-colors",
              isActive && "bg-primary/10 dark:bg-white/[0.06]",
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5 transition-colors",
                isActive ? "text-primary dark:text-[#2dd4bf]" : "text-muted-foreground dark:text-slate-400"
              )}
            />
            <span
              className={cn(
                "text-[10px] font-medium transition-colors",
                isActive ? "text-primary dark:text-[#2dd4bf]" : "text-muted-foreground dark:text-slate-400"
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
