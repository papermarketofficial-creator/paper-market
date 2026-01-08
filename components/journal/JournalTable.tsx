"use client";
import { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { JournalEntry } from "@/types/journal.types";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { analyzeBehavior, BehaviorInsight, BehaviorSeverity } from "@/lib/behavior-analytics";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface JournalTableProps {
  entries: JournalEntry[];
}

export function JournalTable({ entries }: JournalTableProps) {
  // 1. Compute insights derived strictly from current entries
  // Memoized to prevent re-calculation on every render
  const insights = useMemo(() => analyzeBehavior(entries), [entries]);

  // 2. Create O(1) Lookup Map: TradeID -> Insight[]
  const insightsByTrade = useMemo(() => {
    const map = new Map<string, BehaviorInsight[]>();
    
    insights.forEach(insight => {
      insight.tradeIds.forEach(tradeId => {
        const existing = map.get(tradeId) || [];
        existing.push(insight);
        map.set(tradeId, existing);
      });
    });
    
    return map;
  }, [insights]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Helper to get badge color based on severity
  const getSeverityColor = (severity: BehaviorSeverity) => {
    switch (severity) {
      case 'HIGH': return 'border-destructive text-destructive bg-destructive/10';
      case 'MEDIUM': return 'border-orange-500 text-orange-500 bg-orange-500/10';
      default: return 'border-muted-foreground text-muted-foreground bg-muted';
    }
  };

  // Helper to format behavior type for display
  const formatBehaviorType = (type: string) => {
    return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Date</TableHead><TableHead>Instrument</TableHead><TableHead>Symbol</TableHead><TableHead>Side</TableHead><TableHead className="text-right">Entry</TableHead><TableHead className="text-right">Exit</TableHead><TableHead className="text-right">Realized P&L</TableHead><TableHead>Analysis</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                No journal entries recorded.
              </TableCell></TableRow>
          ) : (
            entries.map((entry) => {
              const tradeInsights = insightsByTrade.get(entry.id) || [];

              return (
                <TableRow key={entry.id} className="hover:bg-muted/10"><TableCell className="font-medium text-xs whitespace-nowrap text-muted-foreground">
                    {formatDate(entry.entryTime)}
                  </TableCell><TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {entry.instrument}
                    </Badge>
                  </TableCell><TableCell className="font-medium">{entry.symbol}</TableCell><TableCell>
                    <span
                      className={cn(
                        "flex items-center gap-1 text-xs font-medium",
                        entry.side === "BUY" ? "text-success" : "text-destructive"
                      )}
                    >
                      {entry.side === "BUY" ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {entry.side}
                    </span>
                  </TableCell><TableCell className="text-right font-mono text-xs">
                    {formatCurrency(entry.entryPrice)}
                  </TableCell><TableCell className="text-right font-mono text-xs">
                    {entry.exitPrice ? formatCurrency(entry.exitPrice) : "-"}
                  </TableCell><TableCell className="text-right">
                    {entry.realizedPnL !== undefined ? (
                      <span
                        className={cn(
                          "font-medium",
                          entry.realizedPnL >= 0 ? "text-profit" : "text-loss"
                        )}
                      >
                        {entry.realizedPnL >= 0 ? "+" : ""}
                        {formatCurrency(entry.realizedPnL)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex justify-end">
                         <Badge variant="secondary" className="text-[10px]">OPEN</Badge>
                      </span>
                    )}
                  </TableCell><TableCell>
                    <div className="flex flex-wrap gap-1">
                      {tradeInsights.length === 0 ? (
                        <span className="text-muted-foreground/30 text-[10px]">-</span>
                      ) : (
                        <TooltipProvider>
                          {tradeInsights.map((insight, idx) => (
                            <Tooltip key={`${entry.id}-${idx}`}>
                              <TooltipTrigger asChild>
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "text-[9px] px-1.5 h-5 cursor-help whitespace-nowrap",
                                    getSeverityColor(insight.severity)
                                  )}
                                >
                                  {formatBehaviorType(insight.type)}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{insight.message}</p>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell></TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}