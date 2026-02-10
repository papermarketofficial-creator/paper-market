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
  onClick?: () => void;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ to, className, activeClassName, children, onClick, ...props }, ref) => {
    const pathname = usePathname();
    // Use exact match for active state to avoid conflicts
    const isActive = pathname === to;

    return (
      <Link 
        href={to} 
        ref={ref} 
        className={cn(className, isActive && activeClassName)}
        onClick={onClick}
        {...props}
      >
        {children}
      </Link>
    );
  },
);

NavLink.displayName = 'NavLink';

export { NavLink };