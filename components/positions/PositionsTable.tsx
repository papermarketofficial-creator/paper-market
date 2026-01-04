"use client";
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTradingStore, Position } from '@/stores/tradingStore';
import { cn } from '@/lib/utils';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

interface PositionsTableProps {
  loading?: boolean;
}

export function PositionsTable({ loading = false }: PositionsTableProps) {
  const { positions, closePosition } = useTradingStore();
  const [closingPosition, setClosingPosition] = useState<Position | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);
  };

  const calculatePnL = (position: Position) => {
    return position.side === 'BUY'
      ? (position.currentPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - position.currentPrice) * position.quantity;
  };

  const handleClose = (position: Position) => {
    closePosition(position.id, position.currentPrice);
    setClosingPosition(null);
    toast.success('Position Closed Successfully', {
      description: `Closed ${position.quantity} shares of ${position.symbol}`,
    });
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Open Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            Open Positions
            {positions.length > 0 && (
              <Badge variant="secondary" className="bg-secondary/20 text-secondary">
                {positions.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No Open Positions</p>
              <p className="text-sm">Start trading to see your positions here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Symbol</TableHead>
                    <TableHead className="text-muted-foreground">Side</TableHead>
                    <TableHead className="text-muted-foreground text-right">Qty</TableHead>
                    <TableHead className="text-muted-foreground text-right">Entry</TableHead>
                    <TableHead className="text-muted-foreground text-right">Current</TableHead>
                    <TableHead className="text-muted-foreground text-right">P&L</TableHead>
                    <TableHead className="text-muted-foreground text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((position) => {
                    const pnl = calculatePnL(position);
                    const pnlPercent = ((pnl / (position.entryPrice * position.quantity)) * 100).toFixed(2);
                    
                    return (
                      <TableRow
                        key={position.id}
                        className={cn(
                          'border-border transition-colors',
                          pnl >= 0 ? 'hover:bg-success/5' : 'hover:bg-destructive/5'
                        )}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{position.symbol}</p>
                            <p className="text-xs text-muted-foreground">{position.productType} • {position.leverage}x</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'font-medium',
                              position.side === 'BUY'
                                ? 'border-success text-success'
                                : 'border-destructive text-destructive'
                            )}
                          >
                            {position.side === 'BUY' ? (
                              <TrendingUp className="mr-1 h-3 w-3" />
                            ) : (
                              <TrendingDown className="mr-1 h-3 w-3" />
                            )}
                            {position.side}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-foreground font-medium">
                          {position.quantity}
                        </TableCell>
                        <TableCell className="text-right text-foreground">
                          {formatCurrency(position.entryPrice)}
                        </TableCell>
                        <TableCell className="text-right text-foreground">
                          {formatCurrency(position.currentPrice)}
                        </TableCell>
                        <TableCell className={cn(
                          'text-right font-semibold',
                          pnl >= 0 ? 'text-profit' : 'text-loss'
                        )}>
                          <div className="animate-pulse-glow">
                            {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                            <p className="text-xs font-normal">
                              ({pnl >= 0 ? '+' : ''}{pnlPercent}%)
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setClosingPosition(position)}
                            className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!closingPosition} onOpenChange={() => setClosingPosition(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Close Position</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to close your position in{' '}
              <span className="font-medium text-foreground">{closingPosition?.symbol}</span>?
              {closingPosition && (
                <span className={cn(
                  'block mt-2 font-medium',
                  calculatePnL(closingPosition) >= 0 ? 'text-profit' : 'text-loss'
                )}>
                  P&L: {calculatePnL(closingPosition) >= 0 ? '+' : ''}
                  {formatCurrency(calculatePnL(closingPosition))}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => closingPosition && handleClose(closingPosition)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Close Position
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
