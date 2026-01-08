"use client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Stock } from '@/content/watchlist';
import { cn } from '@/lib/utils';

interface TradeConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStock: Stock | null;
  side: 'BUY' | 'SELL';
  quantityValue: number;
  currentPrice: number;
  requiredMargin: number;
  productType: 'CNC' | 'MIS';
  leverageValue: number;
  onConfirm: () => void;
}

export function TradeConfirmationDialog({
  open,
  onOpenChange,
  selectedStock,
  side,
  quantityValue,
  currentPrice,
  requiredMargin,
  productType,
  leverageValue,
  onConfirm,
}: TradeConfirmationDialogProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">Confirm Trade</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            Are you sure you want to {side.toLowerCase()} {quantityValue} shares of {selectedStock?.symbol}?
            <br />
            <br />
            <strong>Details:</strong>
            <br />
            Price: {formatCurrency(currentPrice)}
            <br />
            Total Value: {formatCurrency(currentPrice * quantityValue)}
            <br />
            Required Margin: {formatCurrency(requiredMargin)}
            <br />
            Product Type: {productType} {leverageValue > 1 ? `(${leverageValue}x leverage)` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-border hover:bg-muted hover:text-muted-foreground">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              side === 'BUY'
                ? 'bg-success hover:bg-success/90 text-success-foreground'
                : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
            )}
          >
            Confirm {side}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}