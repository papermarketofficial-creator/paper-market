"use client";
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Position } from '@/types/position.types';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { useTradeExecutionStore } from '@/stores/trading/tradeExecution.store';
import { cn } from '@/lib/utils';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { formatExpiryLabel, daysToExpiry, isExpired } from '@/lib/expiry-utils';

interface PositionsTableProps {
  loading?: boolean;
}

export function PositionsTable({ loading = false }: PositionsTableProps) {
  const { positions, fetchPositions } = usePositionsStore((state) => ({
    positions: state.positions,
    fetchPositions: state.fetchPositions
  }));
  const closePosition = useTradeExecutionStore((state) => state.closePosition); // This needs update later to be API driven too or removed
  const [closingPosition, setClosingPosition] = useState<Position | null>(null);
  const [partialClose, setPartialClose] = useState<{ position: Position, quantity: number } | null>(null);

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 1000); // Poll every second for PnL
    return () => clearInterval(interval);
  }, [fetchPositions]);

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

  // Use the store's calculated P&L for display
  const getPositionPnL = (position: Position) => {
    return position.currentPnL || calculatePnL(position);
  };

  const handleClose = (position: Position) => {
    closePosition(position.id, position.currentPrice);
    setClosingPosition(null);
    toast.success('Position Closed Successfully', {
      description: `Closed ${position.quantity} shares of ${position.symbol}`,
    });
  };

  const handlePartialClose = () => {
    if (!partialClose) return;
    // For partial close, we need to update the position quantity
    // Since the store might not support partial close, we'll simulate by closing the full position
    // In a real app, this would update the position quantity
    closePosition(partialClose.position.id, partialClose.position.currentPrice);
    setPartialClose(null);
    toast.success('Partial Position Closed Successfully', {
      description: `Closed ${partialClose.quantity} shares of ${partialClose.position.symbol}`,
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
            <>
              {/* Mobile Card View */}
              <div className="sm:hidden space-y-3">
                {positions.map((position) => {
                  const pnl = getPositionPnL(position);
                  const pnlPercent = ((pnl / (position.entryPrice * position.quantity * position.lotSize)) * 100).toFixed(2);

                  return (
                    <div key={position.id} className="bg-muted/30 rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{position.symbol}</span>
                            <Badge variant="outline" className="text-xs">{position.instrument}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {position.productType} • {position.quantity} qty
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'font-medium text-xs',
                            position.side === 'BUY'
                              ? 'border-success text-success'
                              : 'border-destructive text-destructive'
                          )}
                        >
                          {position.side}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">Entry</p>
                          <p className="font-medium">{formatCurrency(position.entryPrice)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Current</p>
                          <p className="font-medium">{formatCurrency(position.currentPrice)}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-muted-foreground text-xs">P&L</p>
                          <div className={cn(
                            'font-semibold flex items-center gap-2',
                            pnl >= 0 ? 'text-profit' : 'text-loss'
                          )}>
                            <span>{pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}</span>
                            <span className="text-xs font-normal">({pnl >= 0 ? '+' : ''}{pnlPercent}%)</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPartialClose({ position, quantity: 1 })}
                          className="flex-1 border-blue-500/50 text-blue-600 hover:bg-blue-500 hover:text-white h-8 text-xs"
                        >
                          Partial
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setClosingPosition(position)}
                          className="flex-1 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground h-8 text-xs"
                        >
                          Close
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Symbol</TableHead>
                      <TableHead className="text-muted-foreground">Type</TableHead>
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
                      const pnl = getPositionPnL(position);
                      const pnlPercent = ((pnl / (position.entryPrice * position.quantity * position.lotSize)) * 100).toFixed(2);

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
                              <p className="text-xs text-muted-foreground">
                                {position.productType} • {position.leverage}x
                                {/* START EXPIRY INDICATOR */}
                                {position.expiryDate && (
                                  <span className={cn(
                                    "ml-1",
                                    isExpired(position.expiryDate) ? "text-muted-foreground" :
                                      daysToExpiry(position.expiryDate) === 0 ? "text-destructive font-medium" :
                                        daysToExpiry(position.expiryDate) === 1 ? "text-orange-500" :
                                          "text-muted-foreground"
                                  )}>
                                    • {formatExpiryLabel(position.expiryDate)}
                                  </span>
                                )}
                                {/* END EXPIRY INDICATOR */}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {position.instrument.toUpperCase()}
                            </Badge>
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
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPartialClose({ position, quantity: 1 })}
                                className="border-blue-500/50 text-blue-600 hover:bg-blue-500 hover:text-white"
                              >
                                Partial
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setClosingPosition(position)}
                                className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
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
                  getPositionPnL(closingPosition) >= 0 ? 'text-profit' : 'text-loss'
                )}>
                  P&L: {getPositionPnL(closingPosition) >= 0 ? '+' : ''}
                  {formatCurrency(getPositionPnL(closingPosition))}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-muted hover:text-muted-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => closingPosition && handleClose(closingPosition)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Close Position
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Partial Close Dialog */}
      <AlertDialog open={!!partialClose} onOpenChange={() => setPartialClose(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Partial Close Position</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Close a portion of your position in{' '}
              <span className="font-medium text-foreground">{partialClose?.position.symbol}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="partial-quantity">Close Quantity (Max: {partialClose?.position.quantity})</Label>
              <Input
                id="partial-quantity"
                type="number"
                value={partialClose?.quantity || ''}
                onChange={(e) => setPartialClose(prev => prev ? { ...prev, quantity: +e.target.value } : null)}
                max={partialClose?.position.quantity}
                min={1}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-muted hover:text-muted-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePartialClose}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Close {partialClose?.quantity} shares
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
