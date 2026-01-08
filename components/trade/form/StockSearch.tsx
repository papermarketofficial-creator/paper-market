"use client";
import { useState } from 'react';
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
import { Stock } from '@/content/watchlist';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useMarketStore } from '@/stores/trading/market.store';
import { parseOptionSymbol } from '@/lib/fno-utils';
import { formatExpiryLabel, daysToExpiry, isExpired } from '@/lib/expiry-utils';

interface StockSearchProps {
  selectedStock: Stock | null;
  onStockSelect: (stock: Stock) => void;
  instruments: Stock[];
}

export function StockSearch({ selectedStock, onStockSelect, instruments }: StockSearchProps) {
  const [open, setOpen] = useState(false);
  const { instrumentMode } = useMarketStore();

  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">Select Stock</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-background border-input text-foreground hover:bg-muted hover:text-muted-foreground"
          >
            {selectedStock ? (
              <span className="flex items-center gap-2">
                <span className="font-medium">{selectedStock.symbol}</span>
                <span className="text-muted-foreground text-xs truncate">
                  {selectedStock.name}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Search stocks...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search instruments..." />
            <CommandList>
              <CommandEmpty>No instrument found.</CommandEmpty>
              <CommandGroup>
                {instruments.map((stock) => (
                  <CommandItem
                    key={stock.symbol}
                    value={`${stock.symbol} ${stock.name}`}
                    onSelect={() => {
                      onStockSelect(stock);
                      setOpen(false);
                    }}
                    className="data-[selected=true]:bg-muted data-[selected=true]:text-muted-foreground"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedStock?.symbol === stock.symbol
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-1 items-center justify-between">
                      <div>
                        <span className="font-medium">{stock.symbol}</span>
                        {/* ... existing option type badge ... */}
                        {instrumentMode === 'options' && parseOptionSymbol(stock.symbol) && (
                          <span className={cn(
                            'ml-2 px-1 py-0.5 text-xs rounded',
                            parseOptionSymbol(stock.symbol)?.type === 'CE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          )}>
                            {parseOptionSymbol(stock.symbol)?.type}
                          </span>
                        )}
                        
                        {/* START EXPIRY INDICATOR */}
                        {stock.expiryDate && (
                          <span className={cn(
                            "ml-2 text-[10px] px-1.5 py-0.5 rounded border",
                            isExpired(stock.expiryDate) ? "border-muted bg-muted/50 text-muted-foreground" :
                            daysToExpiry(stock.expiryDate) === 0 ? "border-destructive/30 bg-destructive/10 text-destructive" :
                            daysToExpiry(stock.expiryDate) === 1 ? "border-orange-500/30 bg-orange-500/10 text-orange-600" :
                            "border-border text-muted-foreground"
                          )}>
                            {formatExpiryLabel(stock.expiryDate)}
                          </span>
                        )}
                        {/* END EXPIRY INDICATOR */}

                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {stock.name}
                        </p>
                      </div>
                      <span className={cn(
                        'text-sm font-medium',
                        stock.change >= 0 ? 'text-profit' : 'text-loss'
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
