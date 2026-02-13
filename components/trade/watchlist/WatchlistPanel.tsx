"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Stock } from '@/types/equity.types';
import { Plus, ChevronDown, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useMarketStore } from '@/stores/trading/market.store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { WatchlistItemMenu } from './WatchlistItemMenu';
import { WatchlistSkeleton } from './WatchlistSkeleton';
import { useWatchlists, useWatchlistInstruments, useCreateWatchlist } from '@/hooks/queries/use-watchlists';
import { toCanonicalSymbol, toInstrumentKey, toSymbolKey } from '@/lib/market/symbol-normalization';

interface WatchlistPanelProps {
  instruments: Stock[];
  onSelect: (stock: Stock) => void;
  selectedSymbol?: string;
  onOpenSearch: () => void;
}

export function WatchlistPanel({ instruments, onSelect, selectedSymbol, onOpenSearch }: WatchlistPanelProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState('');
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  const [preferredWatchlistId, setPreferredWatchlistId] = useState<string | null>(null);
  const lastAppliedQuerySnapshotRef = useRef<string>('');
  const subscribedSymbolsRef = useRef<string[]>([]);

  // 🔥 NEW: TanStack Query hooks for data fetching
  const { data: watchlists = [], isLoading: isLoadingWatchlists } = useWatchlists();
  const createWatchlistMutation = useCreateWatchlist();

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('lastWatchlistId') : null;
    if (saved) setPreferredWatchlistId(saved);
  }, []);
  
  // Get active watchlist ID from Zustand (UI state only)
  const { activeWatchlistId, setActiveWatchlistId, prefetchInstrument, setStocks } = useMarketStore();
  const quotesByInstrument = useMarketStore((state) => state.quotesByInstrument);
  const resolvedWatchlistId = useMemo(() => {
    if (activeWatchlistId) return activeWatchlistId;
    if (preferredWatchlistId) return preferredWatchlistId;
    const defaultWatchlist = watchlists.find(w => w.isDefault) || watchlists[0];
    return defaultWatchlist?.id ?? null;
  }, [activeWatchlistId, preferredWatchlistId, watchlists]);
  
  // Set default watchlist on mount
  useEffect(() => {
    if (!activeWatchlistId && resolvedWatchlistId) {
      setActiveWatchlistId(resolvedWatchlistId);
    }
  }, [resolvedWatchlistId, activeWatchlistId, setActiveWatchlistId]);

  useEffect(() => {
    if (!resolvedWatchlistId) return;
    localStorage.setItem('lastWatchlistId', resolvedWatchlistId);
  }, [resolvedWatchlistId]);
  
  // Fetch instruments for active watchlist
  const { data: queryInstruments = [], isLoading: isLoadingInstruments } = useWatchlistInstruments(resolvedWatchlistId);

  // Sync query data to Zustand store (for SSE price updates)
  useEffect(() => {
    if (isLoadingInstruments || !queryInstruments) return;

    // Only apply when query payload itself changed.
    // Do NOT compare against live store state; SSE updates would be overwritten.
    const querySnapshot = queryInstruments
      .map((s) => {
        const price = Number(s.price || 0).toFixed(2);
        const change = Number(s.change || 0).toFixed(2);
        const changePercent = Number(s.changePercent || 0).toFixed(2);
        return `${s.instrumentToken}:${price}:${change}:${changePercent}`;
      })
      .sort()
      .join(',');

    if (querySnapshot === lastAppliedQuerySnapshotRef.current) return;

    setStocks(queryInstruments);
    lastAppliedQuerySnapshotRef.current = querySnapshot;
  }, [queryInstruments, isLoadingInstruments, setStocks]);

  const activeWatchlist = watchlists.find(w => w.id === resolvedWatchlistId);
  const isFetchingWatchlistData = isLoadingWatchlists || isLoadingInstruments;

  // Render immediately from query data; switch to store-backed prices once available.
  const localMatches = useMemo(() => {
    if (instruments.length > 0) return instruments;
    return queryInstruments;
  }, [instruments, queryInstruments]);
  const selectedSymbolKey = useMemo(
    () => toSymbolKey(toCanonicalSymbol(selectedSymbol || "")),
    [selectedSymbol]
  );
  const watchlistSymbolsKey = useMemo(() => {
    const uniqueSymbols = Array.from(
      new Set(localMatches.map((stock) => stock.instrumentToken || stock.symbol))
    );
    return uniqueSymbols.sort().join(',');
  }, [localMatches]);

  // ═══════════════════════════════════════════════════════════
  // 🔥 SUBSCRIBE TO ALL WATCHLIST STOCKS FOR REAL-TIME UPDATES
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const symbols = watchlistSymbolsKey ? watchlistSymbolsKey.split(',') : [];
    const previousSymbols = subscribedSymbolsRef.current;

    const toSubscribe = symbols.filter((symbol) => !previousSymbols.includes(symbol));
    const toUnsubscribe = previousSymbols.filter((symbol) => !symbols.includes(symbol));

    if (toSubscribe.length > 0) {
      fetch('/api/v1/market/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: toSubscribe })
      }).catch((err) => console.error('Failed to subscribe to watchlist:', err));
    }

    if (toUnsubscribe.length > 0) {
      fetch('/api/v1/market/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: toUnsubscribe })
      }).catch((err) => console.error('Failed to unsubscribe from watchlist:', err));
    }

    subscribedSymbolsRef.current = symbols;
  }, [watchlistSymbolsKey]);

  useEffect(() => {
    return () => {
      if (subscribedSymbolsRef.current.length === 0) return;
      fetch('/api/v1/market/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: subscribedSymbolsRef.current })
      }).catch((err) => console.error('Failed to unsubscribe from watchlist on unmount:', err));
    };
  }, []);
  const handleCreateWatchlist = async () => {
    if (!newWatchlistName.trim()) return;
    
    try {
      const res = await createWatchlistMutation.mutateAsync(newWatchlistName.trim());
      
      // 🔥 FIX: Switch to the new watchlist immediately
      if (res.success && res.data?.id) {
        setActiveWatchlistId(res.data.id);
      }
      
      setNewWatchlistName('');
      setIsCreating(false);
      toast.success('Watchlist created');
    } catch (error) {
        toast.error('Failed to create watchlist');
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 💀 SKELETON LOADER: Show placeholders while fetching
  // ═══════════════════════════════════════════════════════════
  if (isFetchingWatchlistData && localMatches.length === 0) {
    return <WatchlistSkeleton />;
  }

  return (
    <div className="flex flex-col h-full bg-card border-r border-border w-full max-w-full">
      {/* Header with Selector */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-border bg-accent/30">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-foreground hover:text-primary transition-colors">
              {activeWatchlist?.name || 'Watchlist'}
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {watchlists.map(watchlist => (
              <DropdownMenuItem
                key={watchlist.id}
                onClick={() => setActiveWatchlistId(watchlist.id)}
                className={cn(
                  "text-xs cursor-pointer",
                  watchlist.id === activeWatchlistId && "bg-accent font-medium"
                )}
              >
                {watchlist.name}
                {watchlist.isDefault && (
                  <span className="ml-auto text-[10px] text-muted-foreground"></span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsCreating(true)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Create Watchlist Input */}
      {isCreating && (
        <div className="p-2 border-b border-border bg-accent/20">
          <div className="flex gap-1">
            <Input
              className="h-7 text-xs"
              placeholder="Watchlist name..."
              value={newWatchlistName}
              onChange={(e) => setNewWatchlistName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateWatchlist();
                if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewWatchlistName('');
                }
              }}
              autoFocus
            />
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleCreateWatchlist}
            >
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setIsCreating(false);
                setNewWatchlistName('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* List Content */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {localMatches.map((stock, i) => {
            const quoteKey = toInstrumentKey(stock.instrumentToken || stock.symbol);
            const quote = quotesByInstrument[quoteKey];
            const livePrice = quote?.price ?? 0;
            const liveChange = quote?.change ?? 0;
            const liveChangePercent = quote?.changePercent ?? 0;
            const hasQuote = Number.isFinite(livePrice) && livePrice > 0;
            const renderedStock: Stock = {
              ...stock,
              price: livePrice,
              change: liveChange,
              changePercent: liveChangePercent,
            };

            return (
            <div
              key={`${stock.symbol}-${i}`}
              onClick={() => onSelect(renderedStock)}
              onMouseEnter={() => {
                setHoveredSymbol(stock.symbol);
                if (stock.instrumentToken) prefetchInstrument(stock.instrumentToken);
              }}
              onMouseLeave={() => setHoveredSymbol(null)}
              className={cn(
                "group flex items-center justify-between px-3 py-2.5 border-b border-border/40 cursor-pointer transition-colors hover:bg-accent/50",
                selectedSymbolKey === toSymbolKey(toCanonicalSymbol(stock.symbol)) &&
                  "bg-accent border-l-2 border-l-primary"
              )}
            >
              {/* Left: Symbol + Name */}
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-sm font-bold text-foreground">{stock.symbol}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[140px]">{stock.name}</span>
              </div>
              
              {/* Right: Price/Percentage OR B/S Buttons */}
              <div className="flex items-center gap-2">
                {hoveredSymbol !== stock.symbol ? (
                  // Normal State: Show Price + Percentage
                  <div className="flex flex-col items-end gap-1">
                    <span 
                      className="text-sm font-mono font-semibold"
                      style={{ color: hasQuote ? (liveChange >= 0 ? '#089981' : '#F23645') : '#6b7280' }}
                    >
                      {hasQuote ? livePrice.toLocaleString('en-IN') : '--'}
                    </span>
                    <span className="text-xs font-mono text-gray-500">
                      {hasQuote
                        ? `${liveChange >= 0 ? '+' : ''}${liveChange.toFixed(2)} (${liveChangePercent.toFixed(2)}%)`
                        : '--'}
                    </span>
                  </div>
                ) : (
                  // Hover State: Show B/S Buttons + Menu
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(renderedStock);
                        (window as any).triggerTrade?.('BUY');
                      }}
                      className="h-7 px-3 text-xs font-bold border border-[#089981] text-[#089981] bg-transparent hover:bg-[#089981] hover:text-white transition-colors"
                    >
                      B
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(renderedStock);
                        (window as any).triggerTrade?.('SELL');
                      }}
                      className="h-7 px-3 text-xs font-bold border border-[#F23645] text-[#F23645] bg-transparent hover:bg-[#F23645] hover:text-white transition-colors"
                    >
                      S
                    </Button>
                    <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                      <WatchlistItemMenu stock={stock} isInWatchlist={true} />
                    </div>
                  </>
                )}
              </div>
            </div>
            );
          })}
          
          {!isFetchingWatchlistData && localMatches.length === 0 && (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No symbols in watchlist
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

