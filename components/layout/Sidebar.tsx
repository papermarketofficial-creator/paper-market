"use client";
import { NavLink } from '@/components/NavLink';
import {
  LayoutDashboard,
  TrendingUp,
  Briefcase,
  History,
  BookOpen,
  Settings,
  Eye,
  BarChart3,
  CandlestickChart,
  Binary,
  LineChart,
  Shield,
  LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Logo from '@/components/general/Logo';
import { usePathname, useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  adminOnly?: boolean;
  children?: { to: string; icon: LucideIcon; label: string }[];
}

// Extended navigation config to include Trade sub-items locally for this view
// In a real app, this would come from your content/navigation.ts
const navItems: NavItem[] = [
  {
    to: '/trade',
    icon: TrendingUp,
    label: 'Trade'
  },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/positions', icon: Briefcase, label: 'Positions' },
  { to: '/orders', icon: History, label: 'Orders' },
  { to: '/watchlist', icon: Eye, label: 'Watchlist' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/journal', icon: BookOpen, label: 'Journal' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/admin', icon: Shield, label: 'Admin', adminOnly: true },
];

interface SidebarProps {
  isAdmin?: boolean;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

import { UserProfile } from './UserProfile';

export function Sidebar({ isAdmin = true, mobileOpen, setMobileOpen }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const filteredNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  // Reusable Nav Content to share between Desktop Sidebar and Mobile Sheet
  const NavContent = () => (
    <nav className="flex-1 space-y-1 p-2 overflow-y-auto overflow-x-hidden scrollbar-none">
      {filteredNavItems.map((item) => {
        const isParentActive = pathname?.startsWith(item.to);

        // --- Render Group with Children (Trade) ---
        if (item.children) {
          return (
            <div key={item.label} className="space-y-1">
              {/* Parent Label (Visible on Hover in Desktop, Always in Mobile) */}
              <div className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors",
                // Desktop: Hide/Show logic for label
                "hidden md:flex md:opacity-0 md:group-hover:opacity-100 md:h-0 md:group-hover:h-auto overflow-hidden duration-300 delay-100",
                // Mobile: Always visible
                "flex opacity-100 h-auto"
              )}>
                <span>{item.label}</span>
              </div>

              {/* Parent Icon (Visible when collapsed on Desktop) */}
              <div className="hidden md:flex md:group-hover:hidden items-center justify-center h-10 w-10 mx-auto text-sidebar-foreground/70">
                <item.icon className={cn("h-5 w-5", isParentActive && "text-primary")} />
              </div>

              {/* Children Items */}
              <div className="space-y-1">
                {item.children.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors relative',
                      'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      // Indent children only when expanded on Desktop
                      'md:group-hover:pl-6',
                      // Basic mobile indent
                      'pl-3'
                    )}
                    activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                    onClick={() => setMobileOpen?.(false)} // Close on click (Mobile)
                  >
                    <child.icon className="h-5 w-5 flex-shrink-0" />

                    <span className={cn(
                      "whitespace-nowrap transition-all duration-300",
                      // Desktop: Hide text when collapsed
                      "hidden md:block md:opacity-0 md:w-0 md:group-hover:opacity-100 md:group-hover:w-auto md:translate-x-[-10px] md:group-hover:translate-x-0",
                      // Mobile: Always visible
                      "block opacity-100 w-auto"
                    )}>
                      {child.label}
                    </span>

                    {/* Tooltip for collapsed state (Desktop Only) */}
                    <div className="hidden md:block absolute left-12 bg-popover text-popover-foreground text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-0 pointer-events-none transition-opacity z-50">
                      {child.label}
                    </div>
                  </NavLink>
                ))}
              </div>
            </div>
          );
        }

        // --- Render Standard Item ---
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative',
              'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
            onClick={() => setMobileOpen?.(false)}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />

            <span className={cn(
              "whitespace-nowrap transition-all duration-300",
              // Desktop: Hide text when collapsed
              "hidden md:block md:opacity-0 md:w-0 md:group-hover:opacity-100 md:group-hover:w-auto md:translate-x-[-10px] md:group-hover:translate-x-0",
              // Mobile: Always visible
              "block opacity-100 w-auto"
            )}>
              {item.label}
            </span>
          </NavLink>
        );
      })}
    </nav>
  )

  return (
    <>
      {/* DESKTOP SIDEBAR (Hidden on mobile) */}
      <aside
        className={cn(
          'hidden md:flex fixed left-0 top-0 z-50 h-screen bg-sidebar border-r border-sidebar-border',
          'w-16 hover:w-64', // Width transition
          'transition-[width] duration-300 ease-in-out',
          'flex-col group overflow-hidden shadow-xl'
        )}
      >
        {/* Logo Section */}
        <div className="flex h-16 items-center border-b border-sidebar-border px-4 flex-shrink-0 whitespace-nowrap overflow-hidden">
          <Logo hideText={false} className="flex-shrink-0 transition-opacity duration-300" />
        </div>

        {/* Navigation */}
        <NavContent />

        {/* Footer */}
        <UserProfile />
      </aside>

      {/* MOBILE SIDEBAR (Sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="p-0 bg-sidebar w-64 text-sidebar-foreground border-r-sidebar-border"
          overlayClassName="bg-transparent/0 backdrop-blur-none"
          hideClose={true}
        >
          <SheetHeader className="h-16 flex flex-row items-center justify-start border-b border-sidebar-border px-4">
            <Logo hideText={false} />
            <SheetTitle className="sr-only">Menu</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col h-[calc(100vh-4rem)]">
            <NavContent />
            <UserProfile />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}