"use client";

import { MoreVertical, Plus, Trash2, Pin, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Stock } from '@/types/equity.types';
import { useMarketStore } from '@/stores/trading/market.store';
import { toast } from 'sonner';

interface WatchlistItemMenuProps {
  stock: Stock;
  isInWatchlist?: boolean;
}

export function WatchlistItemMenu({ stock, isInWatchlist = true }: WatchlistItemMenuProps) {
  const { addToWatchlist, removeFromWatchlist } = useMarketStore();

  const handleAddToWatchlist = async (e: React.MouseEvent) => {
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

  const handleRemoveFromWatchlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!stock.instrumentToken) {
      toast.error('Cannot remove: Missing instrument token');
      return;
    }

    try {
      await removeFromWatchlist(stock.instrumentToken);
      toast.success(`Removed ${stock.symbol} from watchlist`);
    } catch (error) {
      toast.error('Failed to remove from watchlist');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 p-1">
        {!isInWatchlist ? (
          <DropdownMenuItem onClick={handleAddToWatchlist} className="gap-2 cursor-pointer">
            <Plus className="h-4 w-4" />
            <span>Add to Watchlist</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem 
            onClick={handleRemoveFromWatchlist} 
            className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
            <span>Remove from Watchlist</span>
          </DropdownMenuItem>
        )}
        

      </DropdownMenuContent>
    </DropdownMenu>
  );
}
