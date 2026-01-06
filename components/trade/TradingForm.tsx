"use client";
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import { useTradingStore } from '@/stores/tradingStore';
import { stocksList, Stock } from '@/data/stocks';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { EducationalTooltip } from '@/components/ui/educational-tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';

interface TradingFormProps {
  selectedStock: Stock | null;
  onStockSelect: (stock: Stock) => void;
}

export function TradingForm({ selectedStock, onStockSelect }: TradingFormProps) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('1');
  const [productType, setProductType] = useState<'CNC' | 'MIS'>('CNC');
  const [leverage, setLeverage] = useState('1');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const { executeTrade, balance } = useTradingStore();

  const currentPrice = selectedStock?.price || 0;
  const leverageValue = parseInt(leverage);
  const quantityValue = parseInt(quantity) || 0;
  const requiredMargin = (currentPrice * quantityValue) / leverageValue;

  const canTrade = selectedStock && quantityValue > 0 && requiredMargin <= balance;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);
  };

  const handleSubmit = () => {
    if (!selectedStock || !canTrade) return;
    setShowConfirmDialog(true);
  };

  const confirmTrade = () => {
    if (!selectedStock) return;

    executeTrade({
      symbol: selectedStock.symbol,
      name: selectedStock.name,
      side,
      quantity: quantityValue,
      entryPrice: currentPrice,
      productType,
      leverage: leverageValue,
      timestamp: new Date(),
    });

    toast.success('Trade Executed Successfully (Simulated)', {
      description: `${side} ${quantityValue} shares of ${selectedStock.symbol} at ${formatCurrency(currentPrice)}`,
    });

    setQuantity('1');
    setShowConfirmDialog(false);
  };

  return (
    <TooltipProvider>
      <Card className="bg-card border-border h-full">
        <CardHeader>
          <CardTitle className="text-foreground">Place Order</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
        {/* Stock Search */}
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
                <CommandInput placeholder="Search stocks..." />
                <CommandList>
                  <CommandEmpty>No stock found.</CommandEmpty>
                  <CommandGroup>
                    {stocksList.map((stock) => (
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

        {/* Buy/Sell Toggle */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">Order Type</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={side === 'BUY' ? 'default' : 'outline'}
              onClick={() => setSide('BUY')}
              className={cn(
                'w-full transition-all',
                side === 'BUY'
                  ? 'bg-success hover:bg-muted text-success-foreground hover:text-muted-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-success/50'
              )}
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              BUY
            </Button>
            <Button
              variant={side === 'SELL' ? 'default' : 'outline'}
              onClick={() => setSide('SELL')}
              className={cn(
                'w-full transition-all',
                side === 'SELL'
                  ? 'bg-destructive hover:bg-muted text-destructive-foreground hover:text-muted-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-destructive/50'
              )}
            >
              <TrendingDown className="mr-2 h-4 w-4" />
              SELL
            </Button>
          </div>
        </div>

        {/* Quantity */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground">Quantity</Label>
            <EducationalTooltip content="Quantity represents the number of shares you want to trade.">
              <Info className="h-4 w-4" />
            </EducationalTooltip>
          </div>
          <Input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="bg-background border-input text-foreground"
          />
        </div>

        {/* Risk Preview */}
        {selectedStock && quantityValue > 0 && (
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium">Position Size: {((currentPrice * quantityValue) / balance * 100).toFixed(1)}% of portfolio</p>
            <p className="text-xs text-muted-foreground">Recommended: Keep under 5% for risk management</p>
          </div>
        )}

        {/* Product Type */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">Product Type</Label>
          <Select value={productType} onValueChange={(v) => setProductType(v as 'CNC' | 'MIS')}>
            <SelectTrigger className="bg-background border-input text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CNC">CNC (Delivery)</SelectItem>
              <SelectItem value="MIS">MIS (Intraday)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Leverage */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">Leverage</Label>
          <Select value={leverage} onValueChange={setLeverage}>
            <SelectTrigger className="bg-background border-input text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="2">2x</SelectItem>
              <SelectItem value="5">5x</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Read-only Fields */}
        {selectedStock && (
          <div className="space-y-4 rounded-lg bg-muted/30 p-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Market Price</span>
              <span className="text-sm font-medium text-foreground">
                {formatCurrency(currentPrice)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Required Margin</span>
              <span className={cn(
                'text-sm font-medium',
                requiredMargin > balance ? 'text-loss' : 'text-foreground'
              )}>
                {formatCurrency(requiredMargin)}
              </span>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={!canTrade}
          className={cn(
            'w-full h-12 text-lg font-semibold transition-all',
            side === 'BUY'
              ? 'bg-success hover:bg-muted text-success-foreground hover:text-muted-foreground'
              : 'bg-destructive hover:bg-muted text-destructive-foreground hover:text-muted-foreground'
          )}
        >
          {side === 'BUY' ? 'BUY' : 'SELL'} {selectedStock?.symbol || 'Stock'}
        </Button>
      </CardContent>
    </Card>

    {/* Trade Confirmation Dialog */}
    <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">Confirm Trade</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            Are you sure you want to {side.toLowerCase()} {quantityValue} shares of {selectedStock?.symbol}?
            <br />
            <br />
            <strong>Details:</strong>
            <br />
            Price: {formatCurrency(currentPrice)}
            <br />
            Total Value: {formatCurrency(currentPrice * quantityValue)}
            <br />
            Required Margin: {formatCurrency(requiredMargin)}
            <br />
            Product Type: {productType} {leverageValue > 1 ? `(${leverageValue}x leverage)` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-border hover:bg-muted hover:text-muted-foreground">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmTrade}
            className={cn(
              side === 'BUY'
                ? 'bg-success hover:bg-success/90 text-success-foreground'
                : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
            )}
          >
            Confirm {side}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </TooltipProvider>
  );
}
