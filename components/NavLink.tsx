"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface NavLinkProps {
  to: string;
  className?: string;
  activeClassName?: string;
  children?: React.ReactNode;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ to, className, activeClassName, children, ...props }, ref) => {
    const pathname = usePathname();
    const isActive = pathname?.startsWith(to || '');

    return (
      <Link href={to} {...props} ref={ref} className={cn(className, isActive && activeClassName)}>
        {children}
      </Link>
    );
  },
);

NavLink.displayName = 'NavLink';

export { NavLink };
