'use client';
import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Sun, Moon, Trophy, Menu } from "lucide-react";
import { useTheme } from 'next-themes';
import LogoLearn from '@/components/general/LogoLearn';

const LearnLayout = ({ children }: { children: ReactNode }) => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  const navItems = [
    { name: 'Home', href: '/' },
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Learn', href: '/learn' },
  ];

  return (
    <div className="min-h-screen bg-background relative selection:bg-primary/20">
      {/* Top Accent Line - Adds a subtle premium touch */}
      <div className="fixed top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary/80 to-transparent z-[60]" />

      {/* Navbar */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 md:px-8 h-16 flex items-center justify-between max-w-7xl">
          
          {/* Logo Area */}
          <div className="flex items-center">
            <Link href="/learn" className="flex items-center gap-2 transition-transform hover:scale-[1.02] active:scale-[0.98]">
              <LogoLearn />
            </Link>
          </div>

          {/* Center Navigation - Floating Pill Design */}
          <div className="hidden md:flex items-center p-1 bg-secondary/30 border border-border/50 rounded-full backdrop-blur-md">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
              
              return (
                <Link 
                  key={item.href}
                  href={item.href} 
                  className={`
                    px-5 py-1.5 text-sm font-medium rounded-full transition-all duration-300
                    ${isActive 
                      ? "text-primary bg-background shadow-sm ring-1 ring-black/5 dark:ring-white/10" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }
                  `}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {mounted && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="rounded-full text-muted-foreground hover:text-foreground w-9 h-9"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}
            
            {/* Enhanced CTA Button */}
            <Button 
              size="sm" 
              className="rounded-full px-5 font-medium bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 shadow-lg shadow-primary/20 border border-primary/20 transition-all duration-300 hover:-translate-y-0.5"
            >
              <Trophy className="w-3.5 h-3.5 mr-2" />
              My Progress
            </Button>

            {/* Mobile Menu Trigger */}
            <Button variant="ghost" size="icon" className="md:hidden rounded-full text-muted-foreground">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full">
        {children}
      </main>
    </div>
  );
};

export default LearnLayout;