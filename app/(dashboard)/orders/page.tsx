"use client";
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTradingStore } from '@/stores/tradingStore';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Search, ArrowUpDown, History, TrendingUp, TrendingDown } from 'lucide-react';

const OrdersPage = () => {
  const { trades } = useTradingStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'pnl'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'OPEN' | 'CLOSED'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);
  };

  const filteredAndSortedTrades = useMemo(() => {
    let result = [...trades];

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((trade) => trade.status === statusFilter);
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (trade) =>
          trade.symbol.toLowerCase().includes(query) ||
          trade.name.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        const aTime = a.exitTime ? new Date(a.exitTime).getTime() : new Date(a.entryTime).getTime();
        const bTime = b.exitTime ? new Date(b.exitTime).getTime() : new Date(b.entryTime).getTime();
        comparison = bTime - aTime;
      } else if (sortBy === 'pnl') {
        comparison = b.pnl - a.pnl;
      }
      return sortOrder === 'asc' ? -comparison : comparison;
    });

    return result;
  }, [trades, searchQuery, sortBy, sortOrder, statusFilter]);

  const paginatedTrades = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedTrades.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedTrades, currentPage]);

  const totalPages = Math.ceil(filteredAndSortedTrades.length / itemsPerPage);

  const toggleSort = (field: 'date' | 'pnl') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Orders History</h1>
        <p className="text-muted-foreground">View your executed orders and transaction history</p>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by symbol or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-background border-input"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'OPEN' | 'CLOSED')}>
                <SelectTrigger className="w-full sm:w-[140px] bg-background border-input">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'date' | 'pnl')}>
                <SelectTrigger className="w-full sm:w-[140px] bg-background border-input">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="pnl">P&L</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <History className="h-5 w-5" />
            Order History
            {trades.length > 0 && (
              <Badge variant="secondary" className="bg-secondary/20 text-secondary">
                {trades.length} orders
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No Orders Yet</p>
              <p className="text-sm">Place a trade to see your order history</p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block lg:hidden space-y-4">
                {paginatedTrades.map((trade) => (
                  <div key={trade.id} className="p-4 rounded-lg border border-border bg-muted/10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{trade.symbol}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            trade.side === 'BUY'
                              ? 'border-success text-success'
                              : 'border-destructive text-destructive'
                          )}
                        >
                          {trade.side}
                        </Badge>
                      </div>
                      <Badge 
                        variant="secondary" 
                        className={cn(
                          'text-xs',
                          trade.status === 'OPEN' 
                            ? 'bg-primary/20 text-primary' 
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {trade.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Qty</p>
                        <p className="font-medium text-foreground">{trade.quantity}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Entry</p>
                        <p className="font-medium text-foreground">{formatCurrency(trade.entryPrice)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Exit</p>
                        <p className="font-medium text-foreground">
                          {trade.status === 'CLOSED' ? formatCurrency(trade.exitPrice) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">P&L</p>
                        <p className={cn(
                          'font-semibold',
                          trade.status === 'OPEN' ? 'text-muted-foreground' :
                          trade.pnl >= 0 ? 'text-profit' : 'text-loss'
                        )}>
                          {trade.status === 'CLOSED' 
                            ? `${trade.pnl >= 0 ? '+' : ''}${formatCurrency(trade.pnl)}`
                            : '-'
                          }
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      {format(new Date(trade.entryTime), 'dd MMM yyyy, HH:mm')}
                    </p>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead 
                        className="text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort('date')}
                      >
                        <div className="flex items-center gap-1">
                          Date & Time
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead className="text-muted-foreground">Symbol</TableHead>
                      <TableHead className="text-muted-foreground">Side</TableHead>
                      <TableHead className="text-muted-foreground text-right">Qty</TableHead>
                      <TableHead className="text-muted-foreground text-right">Entry</TableHead>
                      <TableHead className="text-muted-foreground text-right">Exit</TableHead>
                      <TableHead 
                        className="text-muted-foreground text-right cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort('pnl')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          P&L
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTrades.map((trade) => (
                      <TableRow key={trade.id} className="border-border">
                        <TableCell className="text-foreground">
                          <div>
                            <p className="font-medium">{format(new Date(trade.entryTime), 'dd MMM yyyy')}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(trade.entryTime), 'HH:mm:ss')}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{trade.symbol}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                              {trade.name}
                            </p>
                          </div>
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
                            {trade.side === 'BUY' ? (
                              <TrendingUp className="mr-1 h-3 w-3" />
                            ) : (
                              <TrendingDown className="mr-1 h-3 w-3" />
                            )}
                            {trade.side}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-foreground font-medium">
                          {trade.quantity}
                        </TableCell>
                        <TableCell className="text-right text-foreground">
                          {formatCurrency(trade.entryPrice)}
                        </TableCell>
                        <TableCell className="text-right text-foreground">
                          {trade.status === 'CLOSED' ? formatCurrency(trade.exitPrice) : '-'}
                        </TableCell>
                        <TableCell className={cn(
                          'text-right font-semibold',
                          trade.status === 'OPEN' ? 'text-muted-foreground' :
                          trade.pnl >= 0 ? 'text-profit' : 'text-loss'
                        )}>
                          {trade.status === 'CLOSED' 
                            ? `${trade.pnl >= 0 ? '+' : ''}${formatCurrency(trade.pnl)}`
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="secondary" 
                            className={cn(
                              trade.status === 'OPEN' 
                                ? 'bg-primary/20 text-primary' 
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {trade.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground text-center sm:text-left">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredAndSortedTrades.length)} of {filteredAndSortedTrades.length}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="border-border"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="border-border"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OrdersPage;
