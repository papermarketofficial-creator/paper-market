"use client";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Crown } from 'lucide-react';

interface PremiumGateProps {
  children: React.ReactNode;
  feature: string;
}

export function PremiumGate({ children, feature }: PremiumGateProps) {
  const isPremium = false; // Replace with actual check
  
  if (isPremium) return <>{children}</>;
  
  return (
    <div className="relative">
      {children}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-lg">
        <div className="text-center space-y-2">
          <Crown className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="text-sm font-medium">Premium Feature</p>
          <p className="text-xs text-muted-foreground">{feature}</p>
          <Button size="sm" variant="outline">
            Upgrade to Premium
          </Button>
        </div>
      </div>
    </div>
  );
}