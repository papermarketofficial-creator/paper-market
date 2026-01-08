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
      <Label className="text-muted-foreground">Leverage</Label>
      <Select value={leverage} onValueChange={onLeverageChange}>
        <SelectTrigger className="bg-background border-input text-foreground">
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