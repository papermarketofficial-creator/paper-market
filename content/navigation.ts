import {
  LayoutDashboard,
  Sparkles,
  Briefcase,
  History,
  BookOpen,
  Settings,
  Eye,
  BarChart3,
  LucideIcon
} from 'lucide-react';

export interface NavItemChild {
  id: string;
  label: string;
  href: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string; // Optional if it has children
  children?: NavItemChild[];
  adminOnly?: boolean;
}

export const navigationConfig: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/dashboard',
  },
  {
    id: 'explore',
    label: 'Explore',
    icon: Sparkles,
    children: [
      {
        id: 'equity',
        label: 'Stocks', // Using "Stocks" to match common terminology for Equity
        href: '/trade/equity',
      },
      {
        id: 'futures',
        label: 'Futures',
        href: '/trade/futures',
      },
      {
        id: 'options',
        label: 'Options',
        href: '/trade/options',
      },
    ],
  },
  {
    id: 'positions',
    label: 'Positions',
    icon: Briefcase,
    href: '/positions',
  },
  {
    id: 'orders',
    label: 'Orders',
    icon: History,
    href: '/orders',
  },
  {
    id: 'watchlist',
    label: 'Watchlist',
    icon: Eye,
    href: '/watchlist',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    href: '/analytics',
  },
  {
    id: 'journal',
    label: 'Journal',
    icon: BookOpen,
    href: '/journal',
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Settings,
    href: '/admin',
    adminOnly: true,
  },
];