"use client";

import { useEffect, useState } from 'react';
import { useGlobalStore } from '@/stores/global.store';
import { useMarketStore } from '@/stores/trading/market.store';
import { useWalletStore } from '@/stores/wallet.store';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// Index symbols to track (must match database tradingsymbol exactly)
const INDEX_SYMBOLS = ['NIFTY 50', 'NIFTY BANK', 'NIFTY FIN SERVICE'] as const;

export function MarketStatusBar() {
    const { selectedSymbol } = useGlobalStore();
    const balance = useWalletStore((state) => state.balance);
    const [indexPrices, setIndexPrices] = useState({
        'NIFTY 50': 0,
        'NIFTY BANK': 0,
        'NIFTY FIN SERVICE': 0,
    });
    const [indexChanges, setIndexChanges] = useState({
        'NIFTY 50': 0,
        'NIFTY BANK': 0,
        'NIFTY FIN SERVICE': 0,
    });

    // Subscribe to indices on mount
    useEffect(() => {
        const subscribeToIndices = async () => {
            try {
                // Subscribe to all indices
                const res = await fetch('/api/v1/market/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ symbols: INDEX_SYMBOLS }),
                });

                if (!res.ok) {
                    console.error('Failed to subscribe to indices:', await res.text());
                    return;
                }

                console.log('✅ Subscribed to indices:', INDEX_SYMBOLS);

                // Map of display symbol to instrument token format
                const symbolToToken: Record<string, string> = {
                    'NIFTY 50': 'NSE_INDEX|Nifty 50',
                    'NIFTY BANK': 'NSE_INDEX|Nifty Bank',
                    'NIFTY FIN SERVICE': 'NSE_INDEX|Nifty Fin Service',
                };

                // Get instrument keys for quote fetch
                const instrumentKeys = INDEX_SYMBOLS.map(symbol => symbolToToken[symbol]);
                console.log('📊 Fetching quotes for instrument keys:', instrumentKeys);

                // Fetch initial quotes for indices
                const quotesRes = await fetch('/api/v1/market/quotes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instrumentKeys }),
                });

                if (quotesRes.ok) {
                    const quotesData = await quotesRes.json();
                    console.log('📊 Quotes API response:', quotesData);
                    
                    if (quotesData.success && quotesData.data) {
                        const quotes = quotesData.data;
                        console.log('📊 Quote keys:', Object.keys(quotes));
                        
                        const newPrices: any = {};
                        const newChanges: any = {};

                        INDEX_SYMBOLS.forEach(symbol => {
                            const instrumentToken = symbolToToken[symbol];
                            
                            // Try multiple lookup strategies
                            let quote = quotes[instrumentToken];
                            
                            // Fallback: Try to find by partial match
                            if (!quote) {
                                const quoteKeys = Object.keys(quotes);
                                const matchingKey = quoteKeys.find(key => 
                                    key.includes(symbol) || 
                                    key.toLowerCase().includes(symbol.toLowerCase())
                                );
                                if (matchingKey) {
                                    quote = quotes[matchingKey];
                                    console.log(`🔄 Found quote using fallback key: ${matchingKey}`);
                                }
                            }
                            
                            console.log(`🔍 Looking for ${symbol} with token ${instrumentToken}:`, quote);
                            
                            if (quote) {
                                newPrices[symbol] = quote.last_price || 0;
                                const close = quote.close_price || quote.last_price || 0;
                                newChanges[symbol] = close > 0 ? ((quote.last_price - close) / close) * 100 : 0;
                                console.log(`✅ ${symbol}: ${quote.last_price} (${newChanges[symbol].toFixed(2)}%)`);
                            } else {
                                console.warn(`⚠️ No quote found for ${symbol} (${instrumentToken})`);
                                console.warn(`Available keys:`, Object.keys(quotes));
                            }
                        });

                        setIndexPrices(prev => ({ ...prev, ...newPrices }));
                        setIndexChanges(prev => ({ ...prev, ...newChanges }));
                        console.log('📊 Initial index prices loaded:', newPrices);
                    }
                } else {
                    console.warn(
                        '⚠️ Quotes bootstrap unavailable, waiting for live ticks:',
                        quotesRes.status,
                        await quotesRes.text()
                    );
                }
            } catch (error) {
                console.error('Failed to subscribe to indices:', error);
            }
        };

        subscribeToIndices();

        // Cleanup: Unsubscribe on unmount
        return () => {
            fetch('/api/v1/market/subscribe', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbols: INDEX_SYMBOLS }),
            }).catch(err => console.error('Failed to unsubscribe from indices:', err));
        };
    }, []);

    // Listen to live price updates from the market store via selectors
    const indices = useMarketStore(state => state.indices);
    const stocks = useMarketStore(state => state.stocks);

    useEffect(() => {
        // Update index prices when stocks/indices are updated
        INDEX_SYMBOLS.forEach(symbol => {
            // Check in indices list first, then stocks
            const data = indices.find(s => s.symbol === symbol) || 
                         stocks.find(s => s.symbol === symbol);
            
            if (data && data.price > 0) {
                setIndexPrices(prev => ({
                    ...prev,
                    [symbol]: data.price,
                }));
                // Only update change if it's non-zero or we need to reset
                if (data.changePercent !== 0) {
                    setIndexChanges(prev => ({
                        ...prev,
                        [symbol]: data.changePercent,
                    }));
                }
            }
        });
    }, [indices, stocks]); // Re-run when indices/stocks array reference changes

    const formatPrice = (price: number) => price > 0 ? price.toFixed(2) : '—';
    const formatChange = (change: number) => {
        if (change === 0) return '';
        const sign = change > 0 ? '+' : '';
        return `${sign}${change.toFixed(2)}%`;
    };

    return (
        <div className="h-8 bg-card/60 backdrop-blur-md border-b border-white/5 flex items-center px-4 justify-between text-xs overflow-hidden">
            {/* Left: Indices Ticker */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-4 text-muted-foreground font-mono">
                    {/* NIFTY 50 */}
                    <div className="flex items-center gap-1.5">
                        <span className={cn("font-bold", selectedSymbol === "NIFTY" && "text-primary")}>NIFTY</span>
                        <span className="text-foreground">{formatPrice(indexPrices['NIFTY 50'])}</span>
                        {indexChanges['NIFTY 50'] !== 0 && (
                            <span className={cn(
                                "text-[10px]",
                                indexChanges['NIFTY 50'] >= 0 ? "text-[#089981]" : "text-[#F23645]"
                            )}>
                                {formatChange(indexChanges['NIFTY 50'])}
                            </span>
                        )}
                    </div>

                    {/* NIFTY BANK */}
                    <div className="flex items-center gap-1.5">
                        <span className={cn("font-bold", selectedSymbol === "BANKNIFTY" && "text-primary")}>BANKNIFTY</span>
                        <span className="text-foreground">{formatPrice(indexPrices['NIFTY BANK'])}</span>
                        {indexChanges['NIFTY BANK'] !== 0 && (
                            <span className={cn(
                                "text-[10px]",
                                indexChanges['NIFTY BANK'] >= 0 ? "text-[#089981]" : "text-[#F23645]"
                            )}>
                                {formatChange(indexChanges['NIFTY BANK'])}
                            </span>
                        )}
                    </div>

                    {/* NIFTY FIN SERVICE */}
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold">FINNIFTY</span>
                        <span className="text-foreground">{formatPrice(indexPrices['NIFTY FIN SERVICE'])}</span>
                        {indexChanges['NIFTY FIN SERVICE'] !== 0 && (
                            <span className={cn(
                                "text-[10px]",
                                indexChanges['NIFTY FIN SERVICE'] >= 0 ? "text-[#089981]" : "text-[#F23645]"
                            )}>
                                {formatChange(indexChanges['NIFTY FIN SERVICE'])}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Right: Wallet Balance */}
            <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-muted-foreground">Balance:</span>
                <span className="text-foreground font-semibold">
                    ₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
            </div>
        </div>
    );
}
