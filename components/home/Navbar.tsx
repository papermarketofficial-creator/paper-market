import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";

const Navbar = () => {
  return (
    // Wrapper to center the capsule and provide top spacing
    <div className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4">
      <nav className="w-full max-w-6xl bg-background/60 backdrop-blur-xl border border-border/40 rounded-full shadow-2xl shadow-black/5">
        <div className="container mx-auto px-6 py-2.5 flex items-center justify-between">
          
          {/* Logo Section */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center transition-transform group-hover:scale-105">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              Trade Pro
            </span>
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
          
            <Button size="sm" className="rounded-full bg-primary hover:bg-primary/90 px-5">
              Sign In
            </Button>
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Navbar;