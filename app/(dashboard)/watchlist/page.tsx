"use client";
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { stocksList } from '@/data/stocks';
import { cn } from '@/lib/utils';
import { Plus, X } from 'lucide-react';

const WatchlistPage = () => {
  const [watchlist, setWatchlist] = useState<string[]>(['RELIANCE', 'TCS']);
  const [searchQuery, setSearchQuery] = useState('');

  const addToWatchlist = (symbol: string) => {
    if (!watchlist.includes(symbol)) {
      setWatchlist([...watchlist, symbol]);
    }
  };

  const removeFromWatchlist = (symbol: string) => {
    setWatchlist(watchlist.filter(s => s !== symbol));
  };

  const filteredStocks = stocksList.filter(stock => 
    !watchlist.includes(stock.symbol) && 
    stock.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Watchlist</h1>
        <p className="text-muted-foreground">Track your favorite stocks</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Current Watchlist */}
        <Card>
          <CardHeader>
            <CardTitle>My Watchlist ({watchlist.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {watchlist.map(symbol => {
                const stock = stocksList.find(s => s.symbol === symbol);
                return (
                  <div key={symbol} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <p className="font-medium">{symbol}</p>
                      <p className="text-sm text-muted-foreground">{stock?.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-sm font-medium',
                        stock?.change >= 0 ? 'text-green-600' : 'text-red-600'
                      )}>
                        ₹{stock?.price}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => removeFromWatchlist(symbol)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Add Stocks */}
        <Card>
          <CardHeader>
            <CardTitle>Add Stocks</CardTitle>
          </CardHeader>
          <CardContent>
            <Input 
              placeholder="Search stocks..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-4"
            />
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredStocks.slice(0, 10).map(stock => (
                <div key={stock.symbol} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <p className="font-medium">{stock.symbol}</p>
                    <p className="text-sm text-muted-foreground">{stock.name}</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => addToWatchlist(stock.symbol)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default WatchlistPage;