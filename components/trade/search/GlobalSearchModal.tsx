"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Loader2, TrendingUp } from 'lucide-react';
import { useMarketStore } from '@/stores/trading/market.store';
import { Stock } from '@/types/equity.types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface GlobalSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectStock?: (stock: Stock) => void;
}

type SearchCategory = 'ALL' | 'Cash' | 'F&O' | 'Currency' | 'Commodity';

export function GlobalSearchModal({ open, onOpenChange, onSelectStock }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('ALL');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { searchInstruments, searchResults, isSearching, addToWatchlist } = useMarketStore();

  const handleSelect = useCallback((stock: Stock) => {
    onSelectStock?.(stock);
    onOpenChange(false);
  }, [onSelectStock, onOpenChange]);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      if (query.length > 1) {
        searchInstruments(query);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [query, searchInstruments]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setActiveCategory('ALL');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && searchResults[selectedIndex]) {
        e.preventDefault();
        handleSelect(searchResults[selectedIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, searchResults, selectedIndex, handleSelect]);

  const handleAddToWatchlist = async (stock: Stock, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!stock.instrumentToken) {
      toast.error('Cannot add: Missing instrument token');
      return;
    }

    try {
      await addToWatchlist(stock);
      toast.success(`Added ${stock.symbol} to watchlist`);
    } catch (error) {
      toast.error('Failed to add to watchlist');
    }
  };

  const categories: SearchCategory[] = ['ALL', 'Cash', 'F&O', 'Currency', 'Commodity'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg font-semibold">Symbol Search</DialogTitle>
        </DialogHeader>

        {/* Search Input */}
        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for stocks, indices, commodities..."
              className="pl-10 pr-4 h-10 focus-visible:ring-emerald-600"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 px-6 pb-3 border-b border-border/50">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant="ghost"
              size="sm"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "h-8 text-xs font-medium transition-colors",
                activeCategory === cat 
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white" 
                  : "text-muted-foreground hover:bg-emerald-600/10 hover:text-emerald-700"
              )}
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* Results */}
        <ScrollArea className="h-[400px]">
          {query.length <= 1 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <TrendingUp className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">
                Simply start typing while on the chart to pull up this search box
              </p>
            </div>
          ) : searchResults.length === 0 && !isSearching ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">No symbols found</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 px-6 py-2 text-xs font-medium text-emerald-600/60 bg-emerald-50/50 dark:bg-emerald-900/10">
                <div className="col-span-5">SYMBOL</div>
                <div className="col-span-5">DESCRIPTION</div>
                <div className="col-span-2 text-right">EXCHANGE</div>
              </div>

              {/* Results */}
              {searchResults.map((stock, idx) => (
                <div
                  key={`${stock.symbol}-${idx}`}
                  onClick={() => handleSelect(stock)}
                  className={cn(
                    "grid grid-cols-12 gap-4 px-6 py-3 cursor-pointer transition-colors group border-l-2",
                    selectedIndex === idx
                      ? "bg-emerald-500/5 border-emerald-500"
                      : "hover:bg-muted/50 border-transparent"
                  )}
                >
                  <div className="col-span-5 flex items-center gap-2">
                    <span className={cn("font-medium text-sm", selectedIndex === idx ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>{stock.symbol}</span>
                  </div>
                  <div className={cn("col-span-5 text-sm truncate text-muted-foreground")}>
                    {stock.name}
                  </div>
                  <div className="col-span-2 text-right">
                    <span className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded-[2px] text-[10px] font-medium border",
                      selectedIndex === idx 
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30" 
                        : "bg-muted/50 text-muted-foreground border-border/50"
                    )}>
                      NSE
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
