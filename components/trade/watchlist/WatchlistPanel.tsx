"use client";

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Stock } from '@/types/equity.types';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface WatchlistPanelProps {
  instruments: Stock[];
  onSelect: (stock: Stock) => void;
  selectedSymbol?: string;
}

export function WatchlistPanel({ instruments, onSelect, selectedSymbol }: WatchlistPanelProps) {
  const [activeTab, setActiveTab] = useState<'WATCHLIST' | 'ORDERS' | 'PORTFOLIO'>('WATCHLIST');
  const [search, setSearch] = useState('');

  // Mock filtering for now
  const filtered = instruments.filter(i => 
    i.symbol.toLowerCase().includes(search.toLowerCase()) || 
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-card border-r border-border w-full max-w-full">
      {/* Header Tabs */}
      <div className="flex items-center border-b border-border">
        <button
          onClick={() => setActiveTab('WATCHLIST')}
          className={cn(
            "flex-1 h-9 text-xs font-bold uppercase tracking-wider border-b-2 transition-all",
            activeTab === 'WATCHLIST' 
              ? "border-primary text-primary bg-accent/50" 
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/20"
          )}
        >
          Watchlist
        </button>
        <button
          onClick={() => setActiveTab('ORDERS')}
          className={cn(
            "flex-1 h-9 text-xs font-bold uppercase tracking-wider border-b-2 transition-all",
            activeTab === 'ORDERS' 
              ? "border-primary text-primary bg-accent/50" 
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/20"
          )}
        >
          Orders
        </button>
        <button
          onClick={() => setActiveTab('PORTFOLIO')} // Placeholder state
          className={cn(
            "flex-1 h-9 text-xs font-bold uppercase tracking-wider border-b-2 transition-all",
            "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/20"
          )}
        >
          Portfolio
        </button>
      </div>

      {/* Search Bar (Dense) */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input 
            className="h-7 pl-8 text-xs bg-input border-border rounded-sm focus-visible:ring-1 focus-visible:ring-primary/50" 
            placeholder="Search & Add"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List Content */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {filtered.map(stock => (
            <div
              key={stock.symbol}
              onClick={() => onSelect(stock)}
              className={cn(
                "group flex items-center justify-between p-2.5 border-b border-border/40 cursor-pointer transition-colors hover:bg-accent/50",
                selectedSymbol === stock.symbol && "bg-accent border-l-2 border-l-primary"
              )}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-foreground">{stock.symbol}</span>
                <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{stock.name}</span>
              </div>
              
              <div className="flex flex-col items-end gap-0.5">
                <span className={cn(
                  "text-xs font-mono font-medium",
                  stock.change >= 0 ? "text-profit" : "text-loss"
                )}>
                  {stock.price.toLocaleString('en-IN')}
                </span>
                <span className={cn(
                  "text-[10px] font-mono",
                  stock.change >= 0 ? "text-profit" : "text-loss"
                )}>
                  {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)} ({stock.changePercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          ))}
          
          {filtered.length === 0 && (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No symbols found
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
