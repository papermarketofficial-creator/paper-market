import { ReactNode } from 'react';
import DashboardLayoutClient from '@/components/layout/DashboardLayoutClient';

export const metadata = {
  title: 'Dashboard',
  description: 'Your trading dashboard with portfolio overview, positions, and analytics.',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
