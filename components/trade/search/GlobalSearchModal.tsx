"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search, TrendingUp, Bookmark } from "lucide-react";
import { useMarketStore } from "@/stores/trading/market.store";
import { Stock } from "@/types/equity.types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAddInstrument, useRemoveInstrument } from "@/hooks/queries/use-watchlists";
import Spinner from "@/components/ui/spinner";

interface GlobalSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectStock?: (stock: Stock) => void;
  searchMode?: "ALL" | "EQUITY" | "FUTURE" | "OPTION";
  placeholder?: string;
}

type SearchCategory = "ALL" | "Cash" | "F&O" | "Currency" | "Commodity";

export function GlobalSearchModal({
  open,
  onOpenChange,
  onSelectStock,
  searchMode = "ALL",
  placeholder = "Search stocks, indices, commodities...",
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<SearchCategory>("ALL");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [addedInstruments, setAddedInstruments] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);

  const { searchInstruments, searchResults, isSearching, activeWatchlistId } =
    useMarketStore();

  const addInstrumentMutation = useAddInstrument(activeWatchlistId || "");
  const removeInstrumentMutation = useRemoveInstrument(activeWatchlistId || "");

  const handleSelect = useCallback(
    (stock: Stock) => {
      onSelectStock?.(stock);
      onOpenChange(false);
    },
    [onSelectStock, onOpenChange]
  );

  /* ------------------ Debounced Search ------------------ */
  useEffect(() => {
    const handler = setTimeout(() => {
      if (query.length > 1) {
        searchInstruments(query, searchMode);
      }
    }, 250); // slightly faster

    return () => clearTimeout(handler);
  }, [query, searchInstruments, searchMode]);

  /* ------------------ Reset Modal ------------------ */
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setActiveCategory("ALL");
      setAddedInstruments(new Set());

      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults]);

  /* ------------------ Keyboard Navigation ------------------ */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open || !searchResults.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === searchResults.length - 1 ? 0 : prev + 1
        );
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === 0 ? searchResults.length - 1 : prev - 1
        );
      }

      if (e.key === "Enter") {
        e.preventDefault();
        handleSelect(searchResults[selectedIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, searchResults, selectedIndex, handleSelect]);

  /* ------------------ Watchlist Toggle ------------------ */
  const handleToggleWatchlist = async (stock: Stock, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!activeWatchlistId) {
      toast.error("No watchlist selected");
      return;
    }

    const token = stock.instrumentToken;

    if (!token) {
      toast.error("Missing instrument token");
      return;
    }

    const isAdded = addedInstruments.has(token);

    try {
      if (isAdded) {
        await removeInstrumentMutation.mutateAsync(token);

        setAddedInstruments((prev) => {
          const next = new Set(prev);
          next.delete(token);
          return next;
        });

        toast.success(`Removed ${stock.symbol}`);
      } else {
        await addInstrumentMutation.mutateAsync(token);

        setAddedInstruments((prev) => new Set(prev).add(token));

        toast.success(`Added ${stock.symbol}`);
      }
    } catch {
      toast.error("Watchlist update failed");
    }
  };

  const categories: SearchCategory[] = [
    "ALL",
    "Cash",
    "F&O",
    "Currency",
    "Commodity",
  ];

  const showCenteredLoading = query.length > 1 && isSearching && searchResults.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg font-semibold">
            Symbol Search
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />

            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="pl-10 pr-4 h-10 focus-visible:ring-emerald-600"
            />
          </div>
        </div>

        {/* Categories */}
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
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "text-muted-foreground hover:bg-emerald-600/10 hover:text-emerald-700"
              )}
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* RESULTS + SINGLE TOOLTIP PROVIDER */}
        <TooltipProvider delayDuration={80} skipDelayDuration={200}>
          <ScrollArea className="h-[400px]">
            {query.length <= 1 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <TrendingUp className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-sm text-muted-foreground">
                  Start typing to search instruments
                </p>
              </div>
            ) : showCenteredLoading ? (
              <div className="h-[400px] grid place-items-center">
                <div className="flex flex-col items-center justify-center gap-3">
                  <Spinner size={22} />
                  <p className="text-sm text-muted-foreground">Searching...</p>
                </div>
              </div>
            ) : searchResults.length === 0 && !isSearching ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">
                  No symbols found
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {/* Header */}
                <div className="grid grid-cols-12 gap-4 px-6 py-2 text-xs font-medium text-emerald-600/60 bg-emerald-50/50 dark:bg-emerald-900/10">
                  <div className="col-span-4">SYMBOL</div>
                  <div className="col-span-5">DESCRIPTION</div>
                  <div className="col-span-2 text-right">EXCHANGE</div>
                  <div className="col-span-1"></div>
                </div>

                {searchResults.map((stock, idx) => {
                  const token = stock.instrumentToken;
                  const isAdded = token
                    ? addedInstruments.has(token)
                    : false;

                  return (
                    <div
                      key={`${stock.symbol}-${idx}`}
                      onClick={() => handleSelect(stock)}
                      className={cn(
                        "grid grid-cols-12 gap-4 px-6 py-3 cursor-pointer transition-colors border-l-2",
                        selectedIndex === idx
                          ? "bg-emerald-500/5 border-emerald-500"
                          : "hover:bg-muted/50 border-transparent"
                      )}
                    >
                      <div className="col-span-4 font-medium text-sm">
                        {stock.symbol}
                      </div>

                      <div className="col-span-5 text-sm truncate text-muted-foreground">
                        {stock.name}
                      </div>

                      <div className="col-span-2 text-right">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-[2px] text-[10px] font-medium border bg-muted/50 text-muted-foreground border-border/50">
                          NSE
                        </span>
                      </div>

                      {/* Bookmark */}
                      <div className="col-span-1 flex justify-end">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={
                                addInstrumentMutation.isPending ||
                                removeInstrumentMutation.isPending
                              }
                              onClick={(e) =>
                                handleToggleWatchlist(stock, e)
                              }
                              className={cn(
                                "h-7 w-7 opacity-60 hover:opacity-100",
                                isAdded && "text-emerald-600"
                              )}
                            >
                              <Bookmark
                                className={cn(
                                  "h-4 w-4",
                                  isAdded && "fill-current"
                                )}
                              />
                            </Button>
                          </TooltipTrigger>

                          <TooltipContent side="left">
                            {isAdded
                              ? "Remove from watchlist"
                              : "Add to watchlist"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
