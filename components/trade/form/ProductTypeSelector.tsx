"use client";
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProductTypeSelectorProps {
  productType: 'CNC' | 'MIS';
  onProductTypeChange: (productType: 'CNC' | 'MIS') => void;
}

export function ProductTypeSelector({ productType, onProductTypeChange }: ProductTypeSelectorProps) {
  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">Product Type</Label>
      <Select value={productType} onValueChange={(v) => onProductTypeChange(v as 'CNC' | 'MIS')}>
        <SelectTrigger className="bg-background border-input text-foreground">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="CNC">CNC (Delivery)</SelectItem>
          <SelectItem value="MIS">MIS (Intraday)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}