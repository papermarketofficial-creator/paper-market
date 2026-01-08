"use client";
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useTradeExecutionStore } from '@/stores/trading/tradeExecution.store';
import { useRiskStore } from '@/stores/trading/risk.store';
import { useMarketStore } from '@/stores/trading/market.store';
import { Stock } from '@/types/equity.types';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  StockSearch,
  OrderTypeToggle,
  QuantityInput,
  RiskPreview,
  OptionsRiskMetrics,
  OptionsPayoffChart,
  ProductTypeSelector,
  LeverageSelector,
  MarginDisplay,
  TradeConfirmationDialog,
} from './form';

interface TradingFormProps {
  selectedStock: Stock | null;
  onStockSelect: (stock: Stock) => void;
  instruments: Stock[];
}

export function TradingForm({ selectedStock, onStockSelect, instruments }: TradingFormProps) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('1'); // User input (Lots for F&O, Shares for Eq)
  const [productType, setProductType] = useState<'CNC' | 'MIS'>('CNC');
  const [leverage, setLeverage] = useState('1');
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const { instrumentMode } = useMarketStore();
  const executeTrade = useTradeExecutionStore((state) => state.executeTrade);
  const balance = useRiskStore((state) => state.balance);

  // Derived Values
  const currentPrice = selectedStock?.price || 0;
  const leverageValue = parseInt(leverage);
  
  // Input represents "Lots", so we multiply for calculations
  const inputValue = parseInt(quantity) || 0;
  const lotSize = selectedStock?.lotSize || 1;
  const totalQuantity = inputValue * lotSize; 

  const requiredMargin = (currentPrice * totalQuantity) / leverageValue;

  // --- VALIDATION LOGIC ---
  const slValue = parseFloat(stopLoss);
  const targetValue = parseFloat(target);
  
  const hasSl = stopLoss.trim() !== '' && !isNaN(slValue);
  const hasTarget = target.trim() !== '' && !isNaN(targetValue);

  // 1. SL Validation (Absolute Price)
  let isSlValid = true;
  if (hasSl) {
    isSlValid = side === 'BUY' 
      ? slValue < currentPrice 
      : slValue > currentPrice;
  }

  // 2. Target Validation (Absolute Price)
  let isTargetValid = true;
  if (hasTarget) {
    isTargetValid = side === 'BUY' 
      ? targetValue > currentPrice 
      : targetValue < currentPrice;
  }

  // 3. Quantity Validation
  // Fix: Removed `inputValue % lotSize === 0` check. 
  // Since input is "Lots", any integer > 0 is valid.
  const isQuantityValid = inputValue > 0;
  const hasSufficientMargin = requiredMargin <= balance;
  
  const canTrade = selectedStock && isQuantityValid && hasSufficientMargin && isSlValid && isTargetValid;

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
      quantity: totalQuantity, // ✅ Send Total Shares (Lots * LotSize)
      entryPrice: currentPrice,
      productType,
      leverage: leverageValue,
      timestamp: new Date(),
      expiryDate: selectedStock.expiryDate,
      stopLoss: hasSl ? slValue : undefined,
      target: hasTarget ? targetValue : undefined,
    }, selectedStock.lotSize);

    toast.success('Trade Sent', {
      description: `${side} ${totalQuantity} shares (${inputValue} Lots) of ${selectedStock.symbol} at market.`,
    });

    setQuantity('1');
    setStopLoss('');
    setTarget('');
    setShowConfirmDialog(false);
  };

  return (
    <TooltipProvider>
      <Card className="bg-card border-border h-full">
        <CardHeader>
          <CardTitle className="text-foreground">Place Order</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <StockSearch
            selectedStock={selectedStock}
            onStockSelect={onStockSelect}
            instruments={instruments}
          />

          <OrderTypeToggle side={side} onSideChange={setSide} />

          {/* Quantity Input Label Update could be helpful, but keeping component standard */}
          <QuantityInput quantity={quantity} onQuantityChange={setQuantity} />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">
                Stop Loss {instrumentMode === 'equity' && '(Opt)'}
              </Label>
              <Input 
                type="number" 
                placeholder={side === 'BUY' ? '< Entry' : '> Entry'}
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className={cn(
                  "bg-background",
                  hasSl && !isSlValid && "border-destructive focus-visible:ring-destructive"
                )}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">
                Target {instrumentMode === 'equity' && '(Opt)'}
              </Label>
              <Input 
                type="number" 
                placeholder={side === 'BUY' ? '> Entry' : '< Entry'}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className={cn(
                  "bg-background",
                  hasTarget && !isTargetValid && "border-destructive focus-visible:ring-destructive"
                )}
              />
            </div>
          </div>

          <RiskPreview
            selectedStock={selectedStock}
            quantityValue={inputValue} // Pass lots to preview if it expects lots, or handle logic there
            currentPrice={currentPrice}
            balance={balance}
          />

          <OptionsRiskMetrics
            selectedStock={selectedStock}
            quantityValue={inputValue}
            currentPrice={currentPrice}
            lotSize={lotSize}
            side={side}
          />

          <OptionsPayoffChart
            selectedStock={selectedStock}
            quantityValue={inputValue}
            currentPrice={currentPrice}
            lotSize={lotSize}
            side={side}
          />

          <ProductTypeSelector productType={productType} onProductTypeChange={setProductType} />
          <LeverageSelector leverage={leverage} onLeverageChange={setLeverage} />
          
          {/* Ensure MarginDisplay receives the full required margin calculated above */}
          <MarginDisplay 
            selectedStock={selectedStock} 
            currentPrice={currentPrice} 
            requiredMargin={requiredMargin} 
            balance={balance} 
          />

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

      <TradeConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        selectedStock={selectedStock}
        side={side}
        quantityValue={totalQuantity} // Confirm Dialog shows Total Shares
        currentPrice={currentPrice}
        requiredMargin={requiredMargin}
        productType={productType}
        leverageValue={leverageValue}
        onConfirm={confirmTrade}
      />
    </TooltipProvider>
  );
}