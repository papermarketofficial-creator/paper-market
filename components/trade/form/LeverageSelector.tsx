"use client";
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LeverageSelectorProps {
  leverage: string;
  onLeverageChange: (leverage: string) => void;
}

export function LeverageSelector({ leverage, onLeverageChange }: LeverageSelectorProps) {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Leverage</Label>
      <Select value={leverage} onValueChange={onLeverageChange}>
        <SelectTrigger className="bg-input border-border text-foreground h-8 rounded-sm text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">1x</SelectItem>
          <SelectItem value="2">2x</SelectItem>
          <SelectItem value="5">5x</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}