"use client";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EducationalTooltip } from '@/components/ui/educational-tooltip';
import { Info } from 'lucide-react';

interface QuantityInputProps {
  quantity: string;
  onQuantityChange: (quantity: string) => void;
  lotSize?: number;
}

export function QuantityInput({ quantity, onQuantityChange, lotSize = 1 }: QuantityInputProps) {
  const isLots = lotSize > 1;
  const val = parseInt(quantity) || 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{isLots ? 'Lots' : 'Quantity'}</Label>
        <EducationalTooltip content={isLots ? `Enter number of lots. 1 Lot = ${lotSize} shares.` : "Number of shares to trade."}>
          <Info className="h-4 w-4" />
        </EducationalTooltip>
      </div>
      <Input
        type="number"
        min="1"
        value={quantity}
        onChange={(e) => onQuantityChange(e.target.value)}
        onBlur={(e) => {
          // Force state sync on blur to prevent stale state when clicking buttons
          onQuantityChange(e.target.value);
        }}
        className="bg-input border-border text-foreground font-mono h-8 rounded-sm text-xs"
      />
      {isLots && (
        <p className="text-xs text-muted-foreground">
          Total Quantity: <span className="font-medium text-foreground">{val * lotSize}</span> (1 Lot = {lotSize})
        </p>
      )}
    </div>
  );
}