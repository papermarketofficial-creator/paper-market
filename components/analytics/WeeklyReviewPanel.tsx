"use client";
import { useMemo } from 'react';
import { useJournalStore } from '@/stores/trading/journal.store';
import { generateWeeklySummaries, WeeklySummary } from '@/lib/weekly-analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CalendarDays, TrendingUp, TrendingDown, Activity } from 'lucide-react';

export function WeeklyReviewPanel() {
  const entries = useJournalStore((state) => state.entries);
  const summaries = useMemo(() => generateWeeklySummaries(entries), [entries]);

  if (summaries.length === 0) return null;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getTopBehaviors = (summary: WeeklySummary) => {
    return Object.entries(summary.behaviorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
        <CalendarDays className="h-5 w-5" />
        Weekly Reviews
      </h3>
      
      <div className="grid gap-4">
        {summaries.map((week) => (
          <Card key={week.id} className="bg-card border-border">
            <CardHeader className="py-3 px-4 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <span>{formatDate(week.startDate)} — {formatDate(week.endDate)}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono">
                    {week.id}
                  </span>
                </div>
                <div className={cn(
                  "font-mono font-medium text-sm",
                  week.netPnL >= 0 ? "text-success" : "text-destructive"
                )}>
                  {week.netPnL >= 0 ? "+" : ""}{formatCurrency(week.netPnL)}
                </div>
              </div>
            </CardHeader>
            <CardContent className="py-3 px-4 space-y-3">
              {/* Metrics Row */}
              <div className="flex items-center gap-6 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Activity className="h-3 w-3" />
                  <span>{week.totalTrades} Trades</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {week.winRate >= 50 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span>{week.winRate.toFixed(0)}% Win Rate</span>
                </div>
              </div>

              {/* Behaviors Row */}
              {week.insightCount > 0 && (
                <div className="flex flex-wrap gap-2">
                  {getTopBehaviors(week).map(([type, count]) => (
                    <Badge 
                      key={type} 
                      variant="outline" 
                      className="text-[10px] font-normal text-muted-foreground border-border bg-muted/30"
                    >
                      {type.replace(/_/g, ' ').toLowerCase()} ({count})
                    </Badge>
                  ))}
                </div>
              )}

              {/* Factual Note */}
              <p className="text-xs text-muted-foreground/80 leading-relaxed border-l-2 border-primary/20 pl-3">
                {week.note}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}