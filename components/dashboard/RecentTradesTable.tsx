import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trade } from '@/stores/tradingStore';
import { cn } from '@/lib/utils';

interface RecentTradesTableProps {
  trades: Trade[];
  loading?: boolean;
}

export function RecentTradesTable({ trades, loading = false }: RecentTradesTableProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <Card className="bg-card border-border overflow-hidden">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-foreground text-base sm:text-lg">Recent Trades</CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-6 pt-0">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const recentTrades = trades.slice(0, 5);

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-foreground text-base sm:text-lg">Recent Trades</CardTitle>
      </CardHeader>
      <CardContent className="p-2 sm:p-6 pt-0">
        {recentTrades.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            No trades yet. Start trading to see your history.
          </div>
        ) : (
          <>
            {/* Mobile Card Layout */}
            <div className="sm:hidden space-y-3">
              {recentTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="bg-muted/30 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{trade.symbol}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'font-medium text-xs',
                        trade.side === 'BUY'
                          ? 'border-success text-success'
                          : 'border-destructive text-destructive'
                      )}
                    >
                      {trade.side}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Qty: {trade.quantity}</span>
                    <span className={cn(
                      'font-medium',
                      trade.pnl >= 0 ? 'text-profit' : 'text-loss'
                    )}>
                      {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table Layout */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Symbol</TableHead>
                    <TableHead className="text-muted-foreground">Side</TableHead>
                    <TableHead className="text-muted-foreground text-right">Qty</TableHead>
                    <TableHead className="text-muted-foreground text-right">P&L</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTrades.map((trade) => (
                    <TableRow key={trade.id} className="border-border">
                      <TableCell className="font-medium text-foreground">
                        {trade.symbol}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'font-medium',
                            trade.side === 'BUY'
                              ? 'border-success text-success'
                              : 'border-destructive text-destructive'
                          )}
                        >
                          {trade.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {trade.quantity}
                      </TableCell>
                      <TableCell className={cn(
                        'text-right font-medium',
                        trade.pnl >= 0 ? 'text-profit' : 'text-loss'
                      )}>
                        {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          {trade.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
