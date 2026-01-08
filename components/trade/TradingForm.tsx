"use client";
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useTradeExecutionStore } from '@/stores/trading/tradeExecution.store';
import { useRiskStore } from '@/stores/trading/risk.store';
import { Stock } from '@/types/equity.types';
import { InstrumentMode } from '@/types/general.types'; // Import type
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
  instrumentMode: InstrumentMode; // ✅ Required Prop
}

export function TradingForm({ selectedStock, onStockSelect, instruments, instrumentMode }: TradingFormProps) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('1'); 
  const [productType, setProductType] = useState<'CNC' | 'MIS'>('CNC');
  const [leverage, setLeverage] = useState('1');
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Removed useMarketStore hook for mode
  const executeTrade = useTradeExecutionStore((state) => state.executeTrade);
  const balance = useRiskStore((state) => state.balance);

  // ... (Derived values unchanged) ...
  const currentPrice = selectedStock?.price || 0;
  const leverageValue = parseInt(leverage);
  const inputValue = parseInt(quantity) || 0;
  const lotSize = selectedStock?.lotSize || 1;
  const totalQuantity = inputValue * lotSize; 
  const requiredMargin = (currentPrice * totalQuantity) / leverageValue;

  // ... (Validation Logic unchanged) ...
  const slValue = parseFloat(stopLoss);
  const targetValue = parseFloat(target);
  const hasSl = stopLoss.trim() !== '' && !isNaN(slValue);
  const hasTarget = target.trim() !== '' && !isNaN(targetValue);

  let isSlValid = true;
  if (hasSl) {
    isSlValid = side === 'BUY' ? slValue < currentPrice : slValue > currentPrice;
  }
  let isTargetValid = true;
  if (hasTarget) {
    isTargetValid = side === 'BUY' ? targetValue > currentPrice : targetValue < currentPrice;
  }

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
      quantity: totalQuantity,
      entryPrice: currentPrice,
      productType,
      leverage: leverageValue,
      timestamp: new Date(),
      expiryDate: selectedStock.expiryDate,
      stopLoss: hasSl ? slValue : undefined,
      target: hasTarget ? targetValue : undefined,
    }, selectedStock.lotSize, instrumentMode); // ✅ Pass explicit mode

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

          <QuantityInput quantity={quantity} onQuantityChange={setQuantity} />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">
                {/* ✅ Use prop instead of store */}
                Stop Loss {instrumentMode !== 'futures' && '(Opt)'}
              </Label>
              <Input 
                type="number" 
                placeholder={side === 'BUY' ? '< Entry' : '> Entry'}
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className={cn("bg-background", hasSl && !isSlValid && "border-destructive focus-visible:ring-destructive")}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">
                Target {instrumentMode !== 'futures' && '(Opt)'}
              </Label>
              <Input 
                type="number" 
                placeholder={side === 'BUY' ? '> Entry' : '< Entry'}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className={cn("bg-background", hasTarget && !isTargetValid && "border-destructive focus-visible:ring-destructive")}
              />
            </div>
          </div>

          <RiskPreview
            selectedStock={selectedStock}
            quantityValue={inputValue}
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
          <MarginDisplay selectedStock={selectedStock} currentPrice={currentPrice} requiredMargin={requiredMargin} balance={balance} />

          <Button
            onClick={handleSubmit}
            disabled={!canTrade}
            className={cn(
              'w-full h-12 text-lg font-semibold transition-all',
              side === 'BUY' ? 'bg-success hover:bg-muted text-success-foreground' : 'bg-destructive hover:bg-muted text-destructive-foreground'
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
        quantityValue={totalQuantity}
        currentPrice={currentPrice}
        requiredMargin={requiredMargin}
        productType={productType}
        leverageValue={leverageValue}
        onConfirm={confirmTrade}
      />
    </TooltipProvider>
  );
}