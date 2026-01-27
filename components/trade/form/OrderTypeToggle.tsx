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
      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Order Type</Label>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={side === 'BUY' ? 'default' : 'outline'}
          onClick={() => onSideChange('BUY')}
          className={cn(
            'w-full transition-all h-8 text-xs font-bold rounded-sm uppercase tracking-wide',
            side === 'BUY'
              ? 'bg-trade-buy hover:bg-trade-buy/90 text-white'
              : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          <TrendingUp className="mr-2 h-4 w-4" />
          BUY
        </Button>
        <Button
          variant={side === 'SELL' ? 'destructive' : 'outline'}
          onClick={() => onSideChange('SELL')}
          className={cn(
            'w-full transition-all h-8 text-xs font-bold rounded-sm uppercase tracking-wide',
            side === 'SELL'
              ? 'bg-trade-sell hover:bg-trade-sell/90 text-white border border-transparent'
              : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          <TrendingDown className="mr-2 h-4 w-4" />
          SELL
        </Button>
      </div>
    </div>
  );
}