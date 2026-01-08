"use client";
import { useJournalStore } from '@/stores/trading/journal.store';
import { calculatePerformanceMetrics } from '@/lib/performance-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Activity, Target, TrendingUp, AlertTriangle } from 'lucide-react';

export function PerformanceSummary() {
  const entries = useJournalStore((state) => state.entries);
  const metrics = calculatePerformanceMetrics(entries);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* 1. Total Trades */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Trades</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.totalTrades}</div>
          <p className="text-xs text-muted-foreground mt-1">Closed positions only</p>
        </CardContent>
      </Card>

      {/* 2. Win Rate */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
          <Target className={cn(
            "h-4 w-4",
            metrics.winRate >= 50 ? "text-success" : "text-destructive"
          )} />
        </CardHeader>
        <CardContent>
          <div className={cn(
            "text-2xl font-bold",
            metrics.winRate >= 50 ? "text-success" : "text-destructive"
          )}>
            {metrics.winRate}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">Consistency score</p>
        </CardContent>
      </Card>

      {/* 3. Profit Factor */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Profit Factor</CardTitle>
          <TrendingUp className={cn(
            "h-4 w-4",
            metrics.profitFactor >= 1.5 ? "text-success" : metrics.profitFactor >= 1 ? "text-orange-500" : "text-destructive"
          )} />
        </CardHeader>
        <CardContent>
          <div className={cn(
            "text-2xl font-bold",
            metrics.profitFactor >= 1.5 ? "text-success" : metrics.profitFactor >= 1 ? "text-orange-500" : "text-destructive"
          )}>
            {metrics.profitFactor === Infinity ? "∞" : metrics.profitFactor}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Gross Win / Gross Loss</p>
        </CardContent>
      </Card>

      {/* 4. Expectancy */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Expectancy</CardTitle>
          <AlertTriangle className={cn(
            "h-4 w-4",
            metrics.expectancy > 0 ? "text-success" : "text-destructive"
          )} />
        </CardHeader>
        <CardContent>
          <div className={cn(
            "text-2xl font-bold",
            metrics.expectancy > 0 ? "text-success" : "text-destructive"
          )}>
            {metrics.expectancy > 0 ? "+" : ""}{formatCurrency(metrics.expectancy)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Avg P&L per trade</p>
        </CardContent>
      </Card>
    </div>
  );
}