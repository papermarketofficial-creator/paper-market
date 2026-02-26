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
  Shield,
  LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Logo from '@/components/general/Logo';
import { usePathname } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { UserProfile } from './UserProfile';

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  adminOnly?: boolean;
  children?: { to: string; icon: LucideIcon; label: string }[];
}

const navItems: NavItem[] = [
  {
    to: '/trade',
    icon: TrendingUp,
    label: 'Trade',
    children: [
      { to: '/trade/equity', icon: TrendingUp, label: 'Equity' },
      { to: '/trade/futures', icon: BarChart3, label: 'Futures' },
      { to: '/trade/options', icon: BookOpen, label: 'Options' },
    ],
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

export function Sidebar({ isAdmin = true, mobileOpen, setMobileOpen }: SidebarProps) {
  const pathname = usePathname();
  const filteredNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  const NavContent = () => (
    <nav className="flex-1 space-y-1 p-2 overflow-y-auto overflow-x-hidden scrollbar-none">
      {filteredNavItems.map((item) => {
        const isParentActive = pathname?.startsWith(item.to);

        // --- Render Group with Children (Trade) ---
        if (item.children) {
          return (
            <div key={item.label} className="space-y-1">
              {/* Parent Label (Desktop: show on sidebar hover, Mobile: always show) */}
              <div className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm font-medium text-sidebar-foreground/70",
                "transition-opacity duration-200",
                // Desktop: hide when sidebar collapsed
                "max-md:flex max-md:opacity-100",
                "md:opacity-0 md:h-0 md:overflow-hidden",
                "md:group-hover:opacity-100 md:group-hover:h-auto"
              )}>
                <span>{item.label}</span>
              </div>

              {/* Parent Icon (Desktop only, shown when sidebar collapsed) */}
              <div className={cn(
                "hidden md:flex items-center justify-center h-10 w-10 mx-auto text-sidebar-foreground/70",
                "md:group-hover:hidden",
                isParentActive && "text-primary"
              )}>
                <item.icon className="h-5 w-5" />
              </div>

              {/* Children Items: keep hidden when desktop sidebar is collapsed */}
              <div className={cn(
                "space-y-1 transition-all duration-200",
                "max-md:block max-md:opacity-100 max-md:max-h-none",
                "md:opacity-0 md:max-h-0 md:overflow-hidden md:pointer-events-none",
                "md:group-hover:opacity-100 md:group-hover:max-h-96 md:group-hover:pointer-events-auto"
              )}>
                {item.children.map((child) => {
                  const isChildActive =
                    pathname === child.to || pathname?.startsWith(`${child.to}/`);
                  
                  return (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium overflow-hidden',
                        'transition-all duration-200',
                        'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        // Desktop: indent when sidebar expanded
                        'md:group-hover:pl-6',
                        // Mobile: always indented
                        'pl-3',
                        isChildActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
                      )}
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                      onClick={() => setMobileOpen?.(false)}
                    >
                      <child.icon className="h-5 w-5 flex-shrink-0" />

                      <span className={cn(
                        "whitespace-nowrap transition-all duration-200",
                        // Desktop: hide when sidebar collapsed
                        "max-md:block max-md:opacity-100",
                        "md:opacity-0 md:max-w-0 md:overflow-hidden",
                        "md:group-hover:opacity-100 md:group-hover:max-w-[200px]"
                      )}>
                        {child.label}
                      </span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        }

        // --- Render Standard Item ---
        const isActive = pathname === item.to;
        
        return (
          <div key={item.to} className="relative group/item">
            <NavLink
              to={item.to}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium overflow-hidden',
                'transition-all duration-200',
                'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                isActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
              )}
              activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
              onClick={() => setMobileOpen?.(false)}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />

              <span className={cn(
                "whitespace-nowrap transition-all duration-200",
                // Desktop: hide when sidebar collapsed
                "max-md:block max-md:opacity-100",
                "md:opacity-0 md:max-w-0 md:overflow-hidden",
                "md:group-hover:opacity-100 md:group-hover:max-w-[200px]"
              )}>
                {item.label}
              </span>
            </NavLink>

            {/* Tooltip for collapsed state (Desktop Only) */}
            <div className={cn(
              "hidden md:block absolute left-full ml-2 top-1/2 -translate-y-1/2",
              "bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg",
              "opacity-0 pointer-events-none transition-opacity duration-150 z-50 whitespace-nowrap",
              "group-hover/item:opacity-100 group-hover:opacity-0"
            )}>
              {item.label}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* DESKTOP SIDEBAR */}
      <aside
        className={cn(
          'hidden md:flex fixed left-0 top-0 z-50 h-screen',
          'bg-sidebar border-r border-sidebar-border',
          'w-16 hover:w-64',
          'transition-[width] duration-300 ease-in-out',
          'flex-col group shadow-xl',
          'will-change-[width]'
        )}
      >
        {/* Logo Section */}
        <div className="flex h-16 items-center border-b border-sidebar-border px-4 flex-shrink-0 overflow-hidden">
          <Logo hideText={false} className="flex-shrink-0" />
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
