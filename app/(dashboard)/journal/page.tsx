"use client";
import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTradingStore, Trade } from '@/stores/tradingStore';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { BookOpen, TrendingUp, TrendingDown, Save } from 'lucide-react';

const JournalPage = () => {
  const { trades, journalEntries, saveJournalEntry } = useTradingStore();
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [whyEntered, setWhyEntered] = useState('');
  const [whatWentRight, setWhatWentRight] = useState('');
  const [whatWentWrong, setWhatWentWrong] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const selectedTrade = useMemo(() => {
    return trades.find((t) => t.id === selectedTradeId) || null;
  }, [trades, selectedTradeId]);

  // Load existing journal entry when trade is selected
  useEffect(() => {
    if (selectedTradeId) {
      const existingEntry = journalEntries.find((e) => e.tradeId === selectedTradeId);
      if (existingEntry) {
        setWhyEntered(existingEntry.whyEntered);
        setWhatWentRight(existingEntry.whatWentRight);
        setWhatWentWrong(existingEntry.whatWentWrong);
      } else {
        setWhyEntered('');
        setWhatWentRight('');
        setWhatWentWrong('');
      }
    }
  }, [selectedTradeId, journalEntries]);

  // Autosave with debounce
  useEffect(() => {
    if (!selectedTradeId) return;

    const timeoutId = setTimeout(() => {
      saveJournalEntry({
        tradeId: selectedTradeId,
        whyEntered,
        whatWentRight,
        whatWentWrong,
      });
      setLastSaved(new Date());
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [whyEntered, whatWentRight, whatWentWrong, selectedTradeId, saveJournalEntry]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Trading Journal</h1>
        <p className="text-muted-foreground">Document your trades and learn from your decisions</p>
      </div>

      {/* Journal Interface */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Trade List - Left Panel */}
        <Card className="bg-card border-border lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Trades
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {trades.filter(t => t.status === 'CLOSED').length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-muted-foreground">
                <BookOpen className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm text-center">No closed trades to journal yet</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] sm:h-[500px]">
                <div className="space-y-1 p-2">
                  {trades.filter(t => t.status === 'CLOSED').map((trade) => {
                    const hasEntry = journalEntries.some((e) => e.tradeId === trade.id);
                    return (
                      <button
                        key={trade.id}
                        onClick={() => setSelectedTradeId(trade.id)}
                        className={cn(
                          'w-full p-3 rounded-lg text-left transition-colors',
                          selectedTradeId === trade.id
                            ? 'bg-primary/10 border border-primary/30'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-foreground">{trade.symbol}</span>
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
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {trade.exitTime ? format(new Date(trade.exitTime), 'dd MMM yyyy') : '-'}
                          </span>
                          <span className={cn(
                            'font-medium',
                            trade.pnl >= 0 ? 'text-profit' : 'text-loss'
                          )}>
                            {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                          </span>
                        </div>
                        {hasEntry && (
                          <div className="mt-2">
                            <Badge variant="secondary" className="text-xs bg-secondary/20 text-secondary">
                              <Save className="h-3 w-3 mr-1" />
                              Journaled
                            </Badge>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Journal Entry - Right Panel */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center justify-between">
              <span>Journal Entry</span>
              {lastSaved && selectedTradeId && (
                <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                  <Save className="h-3 w-3" />
                  Saved {format(lastSaved, 'HH:mm:ss')}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedTrade ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <BookOpen className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">Select a trade</p>
                <p className="text-sm">Choose a trade from the list to add your notes</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Trade Summary */}
                <div className="rounded-lg bg-muted/30 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg',
                        selectedTrade.pnl >= 0 ? 'bg-success/10' : 'bg-destructive/10'
                      )}>
                        {selectedTrade.pnl >= 0 ? (
                          <TrendingUp className="h-5 w-5 text-success" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-destructive" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{selectedTrade.symbol}</p>
                        <p className="text-xs text-muted-foreground">{selectedTrade.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        'text-xl font-bold',
                        selectedTrade.pnl >= 0 ? 'text-profit' : 'text-loss'
                      )}>
                        {selectedTrade.pnl >= 0 ? '+' : ''}{formatCurrency(selectedTrade.pnl)}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          selectedTrade.side === 'BUY'
                            ? 'border-success text-success'
                            : 'border-destructive text-destructive'
                        )}
                      >
                        {selectedTrade.side} {selectedTrade.quantity} @ {formatCurrency(selectedTrade.entryPrice)}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Entry</p>
                      <p className="text-foreground">{format(new Date(selectedTrade.entryTime), 'dd MMM yyyy HH:mm')}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Exit</p>
                      <p className="text-foreground">{selectedTrade.exitTime ? format(new Date(selectedTrade.exitTime), 'dd MMM yyyy HH:mm') : '-'}</p>
                    </div>
                  </div>
                </div>

                {/* Journal Notes */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-foreground">Why did I enter this trade?</Label>
                    <Textarea
                      placeholder="Describe your entry reasoning, signals, and market conditions..."
                      value={whyEntered}
                      onChange={(e) => setWhyEntered(e.target.value)}
                      className="min-h-[100px] bg-background border-input resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground text-profit">What went right?</Label>
                    <Textarea
                      placeholder="Document what worked well in this trade..."
                      value={whatWentRight}
                      onChange={(e) => setWhatWentRight(e.target.value)}
                      className="min-h-[100px] bg-background border-input resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground text-loss">What went wrong?</Label>
                    <Textarea
                      placeholder="Document what could be improved..."
                      value={whatWentWrong}
                      onChange={(e) => setWhatWentWrong(e.target.value)}
                      className="min-h-[100px] bg-background border-input resize-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default JournalPage;
