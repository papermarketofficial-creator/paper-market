'use client';
import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Sun, Moon, } from "lucide-react";
import { useTheme } from 'next-themes';
import LogoLearn from '@/components/general/LogoLearn';

const LearnLayout = ({ children }: { children: ReactNode }) => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-background relative selection:bg-primary/20">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 md:px-8 py-3 flex items-center justify-between max-w-7xl">
          
          {/* Logo */}
          <Link href="/learn" className="flex items-center gap-2 transition-opacity hover:opacity-90">
            <LogoLearn />
          </Link>

          {/* Navigation */}
          <div className="hidden md:flex items-center gap-1 bg-secondary/30 p-1 rounded-full border border-border/50 backdrop-blur-sm">
            <Link href="/" className="px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-background/50 rounded-full transition-all">
              Home
            </Link>
            <Link href="/dashboard" className="px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-background/50 rounded-full transition-all">
              Dashboard
            </Link>
            <Link href="/learn" className="px-4 py-1.5 text-sm font-medium text-primary bg-background shadow-sm rounded-full transition-all">
              Learn
            </Link>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {mounted && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="rounded-full text-muted-foreground hover:text-foreground"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}
            <Button size="sm" className="rounded-full px-5 font-medium shadow-lg shadow-primary/20">
              My Progress
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