"use client";
import { useState, useEffect } from 'react';
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
import { Position } from '@/types/position.types';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { cn } from '@/lib/utils';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { formatExpiryLabel, daysToExpiry, isExpired } from '@/lib/expiry-utils';
import Spinner from '@/components/ui/spinner';

interface PositionsTableProps {
  loading?: boolean;
}

export function PositionsTable({ loading: parentLoading = false }: PositionsTableProps) {
  const positions = usePositionsStore((state) => state.positions);
  const fetchPositions = usePositionsStore((state) => state.fetchPositions);
  const isLoading = usePositionsStore((state) => state.isLoading);
  const closePosition = usePositionsStore((state) => state.closePosition);
  
  const loading = parentLoading || isLoading;
  
  const [closingPosition, setClosingPosition] = useState<Position | null>(null);
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null); // Track which position is closing

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(() => fetchPositions(true), 5000); // Poll every second for PnL
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
    // Don't calculate if no current price yet
    if (position.currentPrice === 0) return 0;
    
    return position.side === 'BUY'
      ? (position.currentPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - position.currentPrice) * position.quantity;
  };

  // Use the store's calculated P&L for display
  const getPositionPnL = (position: Position) => {
    // If currentPrice is 0, don't show P&L yet
    if (position.currentPrice === 0) return 0;
    return position.currentPnL || calculatePnL(position);
  };


  const handleClose = async (position: Position) => {
    setClosingPositionId(position.id); // Set the specific position being closed
    const success = await closePosition(position.id);
    setClosingPositionId(null); // Clear after completion
    
    if (success) {
      setClosingPosition(null);
    }
  };

  const hasFetched = usePositionsStore((s) => s.hasFetched);

if (!hasFetched) {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Open Positions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12">
          <Spinner size={40} />
          <p className="mt-4 text-muted-foreground">
            Loading positions...
          </p>
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
                            <Badge variant="outline" className="text-xs">{position.instrument?.toUpperCase() || 'EQUITY'}</Badge>
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

                      <div className="pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setClosingPosition(position)}
                          disabled={closingPositionId === position.id}
                          className="w-full border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground h-8 text-xs"
                        >
                          {closingPositionId === position.id ? 'Closing...' : 'Close Position'}
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
                              {position.instrument?.toUpperCase() || 'EQUITY'}
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
                            <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setClosingPosition(position)}
                            disabled={closingPositionId !== null}
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:bg-destructive hover:text-destructive-foreground"
                            >
                              {closingPositionId === position.id ? 'Closing...' : <X className="h-4 w-4" />}
                            </Button>
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

      <AlertDialog open={!!closingPosition} onOpenChange={() => !closingPositionId && setClosingPosition(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Close Position</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to close your position in{' '}
              <span className="font-semibold text-foreground">{closingPosition?.symbol}</span>?
              This will create a market order to exit your position.
            </AlertDialogDescription>
            <div className="mt-4 p-3 bg-muted/50 rounded-md space-y-1">
              <div className="flex justify-between text-sm">
                <span>Current P&L:</span>
                <span className={cn(
                  "font-semibold",
                  closingPosition && getPositionPnL(closingPosition) >= 0 ? "text-trade-buy" : "text-trade-sell"
                )}>
                  {closingPosition && formatCurrency(getPositionPnL(closingPosition))}
                </span>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closingPositionId !== null} className="bg-muted text-foreground hover:bg-muted/80">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => closingPosition && handleClose(closingPosition)}
              disabled={closingPositionId !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {closingPositionId ? 'Closing...' : 'Close Position'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
