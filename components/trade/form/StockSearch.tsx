"use client";
import { useState, useEffect } from 'react';
import { useMarketStore } from '@/stores/trading/market.store';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Stock } from '@/types/equity.types'; // Fixed import path
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { parseOptionSymbol } from '@/lib/fno-utils';
import { formatExpiryLabel, daysToExpiry, isExpired } from '@/lib/expiry-utils';

interface StockSearchProps {
  selectedStock: Stock | null;
  onStockSelect: (stock: Stock) => void;
  instruments: Stock[];
  placeholder?: string;
  className?: string;
  label?: string;
  instrumentMode?: string; // Added prop
}

export function StockSearch({
  selectedStock,
  onStockSelect,
  instruments,
  placeholder = "Search stocks...",
  className,
  label = "Select Stock",
  instrumentMode,
}: StockSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { searchInstruments, searchResults, isSearching } = useMarketStore();

  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length > 1) {
        searchInstruments(query, instrumentMode?.toUpperCase());
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, instrumentMode, searchInstruments]);

  // Use searchResults when searching, otherwise fallback to props (if needed) or empty
  const displayInstruments = query.trim().length > 1 ? searchResults : instruments;

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-card hover:bg-muted/50 border-input h-10 px-3 text-sm"
          >
            {selectedStock ? (
              <span className="flex items-center gap-2 truncate">
                <span className="font-bold text-foreground">{selectedStock.symbol}</span>
                <span className="text-muted-foreground text-xs truncate border-l pl-2 ml-1">
                  {selectedStock.name}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground flex items-center gap-2">
                <Search className="w-4 h-4 opacity-50" />
                {placeholder}
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search symbol..."
              className="h-9"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>No instrument found.</CommandEmpty>
              <CommandGroup>
                {isSearching && <CommandItem disabled>Searching...</CommandItem>}
                {!isSearching && displayInstruments.length === 0 && (
                  <CommandItem disabled>No instruments found.</CommandItem>
                )}
                {displayInstruments.map((stock) => (
                  <CommandItem
                    key={stock.symbol}
                    value={`${stock.symbol} ${stock.name}`}
                    onSelect={() => {
                      onStockSelect(stock);
                      setOpen(false);
                    }}
                    className="data-[selected=true]:bg-muted cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedStock?.symbol === stock.symbol
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-1 items-center justify-between overflow-hidden">
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{stock.symbol}</span>

                          {/* Option Type Badge */}
                          {(instrumentMode === 'options' || parseOptionSymbol(stock.symbol)) && parseOptionSymbol(stock.symbol) && (
                            <span className={cn(
                              'px-1.5 py-0.5 text-[10px] uppercase font-bold rounded-sm tracking-tighter',
                              parseOptionSymbol(stock.symbol)?.type === 'CE'
                                ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                                : 'bg-red-500/15 text-red-700 dark:text-red-400'
                            )}>
                              {parseOptionSymbol(stock.symbol)?.type}
                            </span>
                          )}
                        </div>

                        {/* Expiry Badge */}
                        {stock.expiryDate && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-sm font-medium",
                              isExpired(stock.expiryDate) ? "bg-muted text-muted-foreground line-through" :
                                daysToExpiry(stock.expiryDate) === 0 ? "bg-destructive/10 text-destructive" :
                                  daysToExpiry(stock.expiryDate) === 1 ? "bg-orange-500/10 text-orange-600" :
                                    "bg-secondary text-secondary-foreground"
                            )}>
                              {formatExpiryLabel(stock.expiryDate)}
                            </span>
                          </div>
                        )}
                      </div>

                      <span className={cn(
                        'text-sm font-semibold ml-2 text-right',
                        stock.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      )}>
                        ₹{stock.price.toLocaleString()}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
