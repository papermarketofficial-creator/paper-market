'use client';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import Logo from '@/components/general/Logo';
import { useSession } from 'next-auth/react';

const Navbar = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    // Wrapper to center the capsule and provide top spacing
    <div className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4">
      <nav className="w-full max-w-6xl bg-background/60 backdrop-blur-xl border border-border/40 rounded-full shadow-2xl shadow-black/5">
        <div className="container mx-auto px-6 py-2.5 flex items-center justify-between">

          {/* Logo Section */}
          <Link href="/" className="flex items-center gap-2 group">
            <Logo className="group-hover:scale-105 transition-transform" />
          </Link>

          {/* Navigation Links - Centered visually */}
          <div className="hidden md:flex items-center gap-8">

            <a href="#about" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">About</a>
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Features</a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Pricing</a>
            <a href="#testimonials" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Testimonials</a>
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center gap-2">
            {mounted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="rounded-full"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}
            {session ? (
              <Link href="/dashboard">
                <Button size="sm" className="rounded-full bg-primary hover:bg-primary/90 px-5">
                  Dashboard
                </Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button size="sm" className="rounded-full bg-primary hover:bg-primary/90 px-5">
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Navbar;