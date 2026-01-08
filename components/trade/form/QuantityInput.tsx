"use client";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EducationalTooltip } from '@/components/ui/educational-tooltip';
import { Info } from 'lucide-react';

interface QuantityInputProps {
  quantity: string;
  onQuantityChange: (quantity: string) => void;
}

export function QuantityInput({ quantity, onQuantityChange }: QuantityInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-muted-foreground">Quantity</Label>
        <EducationalTooltip content="Quantity represents the number of shares you want to trade.">
          <Info className="h-4 w-4" />
        </EducationalTooltip>
      </div>
      <Input
        type="number"
        min="1"
        value={quantity}
        onChange={(e) => onQuantityChange(e.target.value)}
        className="bg-background border-input text-foreground"
      />
    </div>
  );
}