"use client";
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useTradeExecutionStore } from '@/stores/trading/tradeExecution.store';
import { useRiskStore } from '@/stores/trading/risk.store';
import { useMarketStore } from '@/stores/trading/market.store'; // Added store import
import { Stock } from '@/types/equity.types';
import { InstrumentMode } from '@/types/general.types';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InstrumentSelector, InstrumentType } from './form/InstrumentSelector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { parseOptionSymbol } from '@/lib/fno-utils';
import { formatExpiryLabel } from '@/lib/expiry-utils';
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
  instrumentMode: InstrumentMode;
}

export function TradingForm({ selectedStock, onStockSelect, instruments: propInstruments, instrumentMode, activeInstrumentType, onInstrumentTypeChange }: TradingFormProps & { activeInstrumentType?: InstrumentType, onInstrumentTypeChange?: (type: InstrumentType) => void }) {
  // New State for Redesign
  const [localInstrumentType, setLocalInstrumentType] = useState<InstrumentType>("NIFTY");

  // Derived state: Use prop if available, else local
  const instrumentType = activeInstrumentType || localInstrumentType;
  const setInstrumentType = (type: InstrumentType) => {
    if (onInstrumentTypeChange) {
      onInstrumentTypeChange(type);
    } else {
      setLocalInstrumentType(type);
    }
  };

  // STRICT SEPARATION: derived from mode, no local state toggle allowed
  const tradeType = instrumentMode === 'options' ? 'options' : 'futures';

  // Selection State
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");
  const [selectedStrike, setSelectedStrike] = useState<string>("");
  const [optionType, setOptionType] = useState<"CE" | "PE">("CE");

  // Existing State
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('1');
  const [productType, setProductType] = useState<'CNC' | 'MIS'>('CNC');
  const [leverage, setLeverage] = useState('1');
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const executeTrade = useTradeExecutionStore((state) => state.executeTrade);
  const balance = useRiskStore((state) => state.balance);
  const { getCurrentInstruments } = useMarketStore();

  // --- LOGIC FOR INSTRUMENT SELECTION ---

  // 1. Get relevant instruments based on selection
  const isEquityMode = instrumentMode === 'equity';

  // Fetch all F&O instruments (Futures + Options) if in F&O mode
  const allFutures = useMemo(() => getCurrentInstruments('futures'), [getCurrentInstruments]);
  const allOptions = useMemo(() => getCurrentInstruments('options'), [getCurrentInstruments]);

  // Filter based on InstrumentType (NIFTY, BANKNIFTY...)
  const filteredInstruments = useMemo(() => {
    if (isEquityMode) return propInstruments; // User is in Equity page, keep logic same

    // STRICT: Only look at source relevant to current mode
    let source: Stock[] = [];
    if (instrumentMode === 'futures') source = allFutures;
    if (instrumentMode === 'options') source = allOptions;

    if (instrumentType === "STOCK OPTIONS") {
      // In Options mode, "STOCK OPTIONS" means all options (filtered later by search)
      return source;
    }

    // Filter by Index Name (e.g. symbol starts with "NIFTY")
    return source.filter(inst => inst.symbol.startsWith(instrumentType));
  }, [isEquityMode, propInstruments, instrumentMode, allFutures, allOptions, instrumentType]);


  // 2. Logic to Auto-Select Contract for Indices
  useEffect(() => {
    if (isEquityMode || instrumentType === "STOCK OPTIONS") return;

    // Reset selection when type changes
    if (!selectedExpiry) {
      // Default to nearest expiry
      const expiries = Array.from(new Set(filteredInstruments
        .filter(i => i.expiryDate)
        .map(i => i.expiryDate!.toISOString())
      )).sort();

      if (expiries.length > 0) setSelectedExpiry(expiries[0]);
    }
  }, [filteredInstruments, isEquityMode, instrumentType, selectedExpiry]);


  // 3. Find the specific contract based on user selection
  useEffect(() => {
    if (isEquityMode || instrumentType === "STOCK OPTIONS") return;

    let match: Stock | undefined;

    if (instrumentMode === 'futures') {
      // Find future with selected expiry
      match = filteredInstruments.find(i => i.expiryDate?.toISOString() === selectedExpiry);
      // Fallback to first if not found (e.g. expiry changed)
      if (!match && filteredInstruments.length > 0) match = filteredInstruments[0];
    } else {
      // Options: Need Expiry + Strike + CE/PE
      if (selectedExpiry && selectedStrike) {
        match = filteredInstruments.find(i =>
          i.expiryDate?.toISOString() === selectedExpiry &&
          parseOptionSymbol(i.symbol)?.strike === parseFloat(selectedStrike) &&
          parseOptionSymbol(i.symbol)?.type === optionType
        );
      }
    }

    if (match && match.symbol !== selectedStock?.symbol) {
      onStockSelect(match);
    }
  }, [isEquityMode, instrumentType, instrumentMode, selectedExpiry, selectedStrike, optionType, filteredInstruments, onStockSelect, selectedStock]);


  // --- DERIVED DATA FOR UI SELECTORS ---
  const availableExpiries = useMemo(() => {
    const dates = filteredInstruments
      .filter(i => i.expiryDate)
      .map(i => i.expiryDate!);

    // Unique dates by time value
    const uniqueDates = Array.from(new Set(dates.map(d => d.getTime())))
      .map(time => new Date(time))
      .sort((a, b) => a.getTime() - b.getTime());

    return uniqueDates;
  }, [filteredInstruments]);

  const availableStrikes = useMemo(() => {
    if (instrumentMode !== 'options') return [];
    // Filter by expiry first
    const withExpiry = filteredInstruments.filter(i => i.expiryDate?.toISOString() === selectedExpiry);
    const strikes = new Set<number>();
    withExpiry.forEach(i => {
      const p = parseOptionSymbol(i.symbol);
      if (p) strikes.add(p.strike);
    });
    return Array.from(strikes).sort((a, b) => a - b);
  }, [filteredInstruments, instrumentMode, selectedExpiry]);


  // --- STANDARD FORM LOGIC ---
  const currentPrice = selectedStock?.price || 0;
  const leverageValue = parseInt(leverage);
  const inputValue = parseInt(quantity) || 0;

  // Correct Lot Size Logic for Indices vs Stocks
  const getLotSize = () => {
    if (selectedStock?.lotSize) return selectedStock.lotSize;

    // Fallback/Hardcoded logic if not in stock data (common for mock data issues)
    if (instrumentType === 'NIFTY') return 50;
    if (instrumentType === 'BANKNIFTY') return 15;
    if (instrumentType === 'FINNIFTY') return 25; // Standard lot sizes
    return 1;
  };

  const lotSize = getLotSize();
  const totalQuantity = inputValue * lotSize;
  const requiredMargin = (currentPrice * totalQuantity) / leverageValue;

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
    }, lotSize, instrumentMode);

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
        {!isEquityMode && (
          <CardHeader className="pb-2">
            <InstrumentSelector
              value={instrumentType}
              onChange={setInstrumentType}
              hideStockOptions={instrumentMode === 'futures'}
            />
          </CardHeader>
        )}

        <CardHeader className={cn("pt-2", !isEquityMode && "pt-0")}>
          {/* TradeTypeSelector removed - derived from route */}
          {isEquityMode && <CardTitle className="text-foreground">Place Order</CardTitle>}
        </CardHeader>

        <CardContent className="space-y-6">
          {/* SEARCH ONLY FOR EQUITY OR STOCK OPTIONS */}
          {(isEquityMode || instrumentType === "STOCK OPTIONS") && (
            <StockSearch
              selectedStock={selectedStock}
              onStockSelect={onStockSelect}
              instruments={instrumentType === "STOCK OPTIONS" ? allOptions : propInstruments}
              instrumentMode={instrumentType === "STOCK OPTIONS" ? 'options' : instrumentMode}
              label={instrumentType === "STOCK OPTIONS" ? "Search Stock Option" : "Select Stock"}
              placeholder={instrumentType === "STOCK OPTIONS" ? "e.g. RELIANCE, TCS..." : "Search stocks..."}
            />
          )}

          {/* INDEX F&O SELECTORS */}
          {!isEquityMode && instrumentType !== "STOCK OPTIONS" && (
            <div className="space-y-4 rounded-lg bg-muted/30 p-4 border border-border/50">
              {/* Expiry Selector */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">Expiry</Label>
                <Select value={selectedExpiry} onValueChange={setSelectedExpiry}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select Expiry" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableExpiries.map(exp => (
                      <SelectItem key={exp.toISOString()} value={exp.toISOString()}>
                        {formatExpiryLabel(exp)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Options Specific Selectors */}
              {tradeType === 'options' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase">Strike Price</Label>
                    <Select value={selectedStrike} onValueChange={setSelectedStrike}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select Strike" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {availableStrikes.map(strike => (
                          <SelectItem key={strike} value={strike.toString()}>
                            {strike}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase">Option Type</Label>
                    <ToggleGroup type="single" value={optionType} onValueChange={(v) => v && setOptionType(v as "CE" | "PE")} className="justify-start w-full">
                      <ToggleGroupItem value="CE" className="data-[state=on]:bg-green-100 data-[state=on]:text-green-700 flex-1">
                        CE (Call)
                      </ToggleGroupItem>
                      <ToggleGroupItem value="PE" className="data-[state=on]:bg-red-100 data-[state=on]:text-red-700 flex-1">
                        PE (Put)
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedStock ? (
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-muted-foreground">
                  {selectedStock.symbol}
                </span>
                <span className={cn("text-lg font-bold", selectedStock.change >= 0 ? "text-profit" : "text-loss")}>
                  ₹{selectedStock.price.toLocaleString()}
                </span>
              </div>

              <OrderTypeToggle side={side} onSideChange={setSide} />
              <div className="mt-6">
                <QuantityInput quantity={quantity} onQuantityChange={setQuantity} lotSize={lotSize} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">
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

              <div className="space-y-4 mt-6">
                <RiskPreview
                  selectedStock={selectedStock}
                  quantityValue={inputValue}
                  currentPrice={currentPrice}
                  balance={balance}
                />

                {/* Show Metrics only if Options mode */}
                {(tradeType === 'options' || (instrumentMode === 'options' && instrumentType === "STOCK OPTIONS")) && (
                  <>
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
                  </>
                )}
              </div>

              <div className="mt-4 space-y-4">
                <ProductTypeSelector productType={productType} onProductTypeChange={setProductType} />
                <LeverageSelector leverage={leverage} onLeverageChange={setLeverage} />
                <MarginDisplay selectedStock={selectedStock} currentPrice={currentPrice} requiredMargin={requiredMargin} balance={balance} />

                <Button
                  onClick={handleSubmit}
                  disabled={!canTrade}
                  variant={side === 'SELL' ? 'destructive' : 'default'}
                  className={cn(
                    'w-full h-12 text-lg font-semibold transition-all',
                    side === 'BUY'
                      ? 'bg-success hover:bg-success/90 text-success-foreground'
                      : '' // Destructive variant handles red styles automatically
                  )}
                >
                  {side === 'BUY' ? 'BUY' : 'SELL'} {selectedStock?.symbol}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-8 border rounded-lg bg-muted/10 border-dashed">
              <p className="text-sm text-muted-foreground">Select an instrument to trade</p>
            </div>
          )}
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