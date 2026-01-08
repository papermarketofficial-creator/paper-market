"use client";
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface OrderTypeToggleProps {
  side: 'BUY' | 'SELL';
  onSideChange: (side: 'BUY' | 'SELL') => void;
}

export function OrderTypeToggle({ side, onSideChange }: OrderTypeToggleProps) {
  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">Order Type</Label>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={side === 'BUY' ? 'default' : 'outline'}
          onClick={() => onSideChange('BUY')}
          className={cn(
            'w-full transition-all',
            side === 'BUY'
              ? 'bg-success hover:bg-muted text-success-foreground hover:text-muted-foreground'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-success/50'
          )}
        >
          <TrendingUp className="mr-2 h-4 w-4" />
          BUY
        </Button>
        <Button
          variant={side === 'SELL' ? 'default' : 'outline'}
          onClick={() => onSideChange('SELL')}
          className={cn(
            'w-full transition-all',
            side === 'SELL'
              ? 'bg-destructive hover:bg-muted text-destructive-foreground hover:text-muted-foreground'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-destructive/50'
          )}
        >
          <TrendingDown className="mr-2 h-4 w-4" />
          SELL
        </Button>
      </div>
    </div>
  );
}