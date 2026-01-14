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
import { TrendingUp, TrendingDown } from "lucide-react";
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
      {entries.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          No journal entries recorded.
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="sm:hidden space-y-3">
            {entries.map((entry) => {
              const tradeInsights = insightsByTrade.get(entry.id) || [];
              return (
                <div key={entry.id} className="bg-muted/30 rounded-lg p-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{entry.symbol}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">{entry.instrument}</Badge>
                    </div>
                    <span className={cn(
                      "flex items-center gap-1 text-xs font-medium",
                      entry.side === "BUY" ? "text-success" : "text-destructive"
                    )}>
                      {entry.side === "BUY" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {entry.side}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="block mb-0.5">Entry</span>
                      <span className="font-medium text-foreground text-sm">{formatCurrency(entry.entryPrice)}</span>
                    </div>
                    <div className="text-right">
                      <span className="block mb-0.5">Exit</span>
                      <span className="font-medium text-foreground text-sm">{entry.exitPrice ? formatCurrency(entry.exitPrice) : "-"}</span>
                    </div>
                    <div>
                      <span className="block mb-0.5">Date</span>
                      <span className="text-foreground">{formatDate(entry.entryTime)}</span>
                    </div>
                    <div className="text-right">
                      <span className="block mb-0.5">P&L</span>
                      {entry.realizedPnL !== undefined ? (
                        <span className={cn(
                          "font-medium text-sm",
                          entry.realizedPnL >= 0 ? "text-profit" : "text-loss"
                        )}>
                          {entry.realizedPnL >= 0 ? "+" : ""}
                          {formatCurrency(entry.realizedPnL)}
                        </span>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">OPEN</Badge>
                      )}
                    </div>
                  </div>

                  {/* Insights Mobile */}
                  {tradeInsights.length > 0 && (
                    <div className="pt-2 border-t border-border/50 flex flex-wrap gap-1.5">
                      {tradeInsights.map((insight, idx) => (
                        <Badge
                          key={`${entry.id}-mob-${idx}`}
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 h-5",
                            getSeverityColor(insight.severity)
                          )}
                        >
                          {formatBehaviorType(insight.type)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Date</TableHead><TableHead>Instrument</TableHead><TableHead>Symbol</TableHead><TableHead>Side</TableHead><TableHead className="text-right">Entry</TableHead><TableHead className="text-right">Exit</TableHead><TableHead className="text-right">Realized P&L</TableHead><TableHead>Analysis</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
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
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}