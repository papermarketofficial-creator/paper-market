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
  LineChart
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Logo from '@/components/general/Logo';
import { usePathname } from 'next/navigation';

// Extended navigation config to include Trade sub-items locally for this view
// In a real app, this would come from your content/navigation.ts
const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  {
    id: 'trade-group',
    label: 'Trade',
    icon: TrendingUp,
    // Parent path for highlighting logic
    to: '/trade', 
    children: [
      { to: '/trade/equity', label: 'Equity', icon: CandlestickChart },
      { to: '/trade/futures', label: 'Futures', icon: LineChart },
      { to: '/trade/options', label: 'Options', icon: Binary },
    ]
  },
  { to: '/positions', icon: Briefcase, label: 'Positions' },
  { to: '/orders', icon: History, label: 'Orders' },
  { to: '/watchlist', icon: Eye, label: 'Watchlist' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/journal', icon: BookOpen, label: 'Journal' },
  { to: '/admin', icon: Settings, label: 'Admin', adminOnly: true },
];

interface SidebarProps {
  isAdmin?: boolean;
}

export function Sidebar({ isAdmin = true }: SidebarProps) {
  const pathname = usePathname();
  const filteredNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 h-screen bg-sidebar border-r border-sidebar-border',
        'w-16 hover:w-64', // Width transition
        'transition-[width] duration-300 ease-in-out',
        'flex flex-col group overflow-hidden shadow-xl'
      )}
    >
      {/* Logo Section */}
      <div className="flex h-16 items-center border-b border-sidebar-border px-4 flex-shrink-0 whitespace-nowrap overflow-hidden">
        <Logo hideText={false} className="flex-shrink-0 transition-opacity duration-300" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2 overflow-y-auto overflow-x-hidden scrollbar-none">
        {filteredNavItems.map((item) => {
          const isParentActive = pathname?.startsWith(item.to);
          
          // --- Render Group with Children (Trade) ---
          if (item.children) {
            return (
              <div key={item.label} className="space-y-1">
                {/* Parent Label (Visible on Hover) */}
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors",
                  // Hide/Show logic for label
                  "opacity-0 group-hover:opacity-100 h-0 group-hover:h-auto overflow-hidden duration-300 delay-100"
                )}>
                  <span>{item.label}</span>
                </div>

                {/* Parent Icon (Visible when collapsed, acts as anchor) */}
                <div className="group-hover:hidden flex items-center justify-center h-10 w-10 mx-auto text-sidebar-foreground/70">
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
                        // Indent children only when expanded
                        'group-hover:pl-6'
                      )}
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                    >
                      <child.icon className="h-5 w-5 flex-shrink-0" />
                      
                      <span className={cn(
                        "whitespace-nowrap transition-all duration-300",
                        // Hide text when collapsed
                        "opacity-0 w-0 group-hover:opacity-100 group-hover:w-auto translate-x-[-10px] group-hover:translate-x-0"
                      )}>
                        {child.label}
                      </span>

                      {/* Tooltip for collapsed state (optional but good for UX) */}
                      <div className="absolute left-12 bg-popover text-popover-foreground text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-0 pointer-events-none transition-opacity z-50">
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
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              
              <span className={cn(
                "whitespace-nowrap transition-all duration-300",
                "opacity-0 w-0 group-hover:opacity-100 group-hover:w-auto translate-x-[-10px] group-hover:translate-x-0"
              )}>
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer / Settings (Optional) */}
      <div className="border-t border-sidebar-border p-2 flex-shrink-0">
        <div className="flex items-center justify-center group-hover:justify-start gap-3 px-3 py-2 text-muted-foreground text-xs">
           <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
             v1.0.0
           </span>
        </div>
      </div>
    </aside>
  );
}