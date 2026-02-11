"use client";

import { useState, useEffect, useRef } from 'react';
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
  const subscribedSymbolsRef = useRef<string[]>([]);

  // 🔥 NEW: TanStack Query hooks for data fetching
  const { data: watchlists = [], isLoading: isLoadingWatchlists } = useWatchlists();
  const createWatchlistMutation = useCreateWatchlist();
  
  // Get active watchlist ID from Zustand (UI state only)
  const { activeWatchlistId, setActiveWatchlistId, prefetchInstrument, setStocks } = useMarketStore();
  
  // Set default watchlist on mount
  useEffect(() => {
    if (!activeWatchlistId && watchlists.length > 0) {
      const defaultWatchlist = watchlists.find(w => w.isDefault) || watchlists[0];
      if (defaultWatchlist) {
        setActiveWatchlistId(defaultWatchlist.id);
      }
    }
  }, [watchlists, activeWatchlistId, setActiveWatchlistId]);
  
  // Fetch instruments for active watchlist
  const { data: queryInstruments = [], isLoading: isLoadingInstruments } = useWatchlistInstruments(activeWatchlistId);
  
  // Sync query data to Zustand store (for SSE price updates)
  useEffect(() => {
    // 🔥 FIX: Prevent infinite loop by checking if data actually changed
    if (!isLoadingInstruments && queryInstruments) {
      const currentIds = queryInstruments.map(s => s.instrumentToken).sort().join(',');
      const storeIds = instruments.map(s => s.instrumentToken).sort().join(',');
      
      if (currentIds !== storeIds) {
        setStocks(queryInstruments);
      }
    }
  }, [queryInstruments, isLoadingInstruments, setStocks, instruments]);
  
  const activeWatchlist = watchlists.find(w => w.id === activeWatchlistId);
  const isFetchingWatchlistData = isLoadingWatchlists || isLoadingInstruments;

  // Show all instruments (use props for live-updated prices from Zustand)
  const localMatches = instruments;

  // ═══════════════════════════════════════════════════════════
  // 🔥 SUBSCRIBE TO ALL WATCHLIST STOCKS FOR REAL-TIME UPDATES
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (instruments.length === 0) return;

    // Subscribe to all watchlist stocks
    const symbols = instruments.map(stock => stock.symbol);
    
    // 🔥 FIX: Create stable key for comparison
    const symbolsKey = symbols.sort().join(',');
    const currentKey = subscribedSymbolsRef.current.sort().join(',');
    
    // 🔥 FIX: If already subscribed to these exact symbols, skip completely
    if (symbolsKey === currentKey) {
      return; // No cleanup needed - already subscribed
    }

    console.log('📡 Subscribing to', symbols.length, 'watchlist stocks:', symbols);

    fetch('/api/v1/market/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols, action: 'subscribe' })
    }).catch(err => console.error('Failed to subscribe to watchlist:', err));

    subscribedSymbolsRef.current = symbols;

    // Cleanup: Unsubscribe when watchlist changes or component unmounts
    return () => {
      console.log('🔕 Unsubscribing from', symbols.length, 'watchlist stocks');
      fetch('/api/v1/market/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, action: 'unsubscribe' })
      }).catch(err => console.error('Failed to unsubscribe from watchlist:', err));
    };
  }, [activeWatchlistId, instruments]); // 🔥 FIX: Re-run when instruments data arrives

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
  if (isFetchingWatchlistData && instruments.length === 0) {
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
          {localMatches.map((stock, i) => (
            <div
              key={`${stock.symbol}-${i}`}
              onClick={() => onSelect(stock)}
              onMouseEnter={() => {
                setHoveredSymbol(stock.symbol);
                if (stock.instrumentToken) prefetchInstrument(stock.instrumentToken);
              }}
              onMouseLeave={() => setHoveredSymbol(null)}
              className={cn(
                "group flex items-center justify-between px-3 py-2.5 border-b border-border/40 cursor-pointer transition-colors hover:bg-accent/50",
                selectedSymbol === stock.symbol && "bg-accent border-l-2 border-l-primary"
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
                      style={{ color: stock.change >= 0 ? '#089981' : '#F23645' }}
                    >
                      {stock.price.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs font-mono text-gray-500">
                      {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)} ({stock.changePercent.toFixed(2)}%)
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
                        onSelect(stock);
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
                        onSelect(stock);
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
          ))}
          
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
