"use client";
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTradeExecutionStore } from '@/stores/trading/tradeExecution.store';
import { useRiskStore } from '@/stores/trading/risk.store';
import { useWalletStore } from '@/stores/wallet.store';
import { useMarketStore } from '@/stores/trading/market.store';
import { usePositionsStore } from '@/stores/trading/positions.store';
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
  PostTradeRiskPreview,
  OrderProcessingDialog,
  OptionsRiskMetrics,
  OptionsPayoffChart,
  ProductTypeSelector,
  LeverageSelector,
  MarginDisplay,
  TradeConfirmationDialog,
} from './form';
import { InsufficientFundsAlert } from '@/components/wallet/InsufficientFundsAlert';

interface TradingFormProps {
  selectedStock: Stock | null;
  onStockSelect: (stock: Stock) => void;
  instruments: Stock[];
  instrumentMode: InstrumentMode;
  allowedInstrumentTypes?: InstrumentType[];
  sheetMode?: boolean;
}

function parseExpiryDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function toExpiryIso(value: unknown): string {
  const parsed = parseExpiryDate(value);
  return parsed ? parsed.toISOString() : '';
}

export function TradingForm({ selectedStock, onStockSelect, instruments: propInstruments, instrumentMode, allowedInstrumentTypes, sheetMode = false, activeInstrumentType, onInstrumentTypeChange }: TradingFormProps & { activeInstrumentType?: InstrumentType, onInstrumentTypeChange?: (type: InstrumentType) => void }) {
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
  const isOrderProcessing = useTradeExecutionStore((state) => state.isOrderProcessing);
  const orderProcessingError = useTradeExecutionStore((state) => state.orderProcessingError);
  const clearOrderProcessingError = useTradeExecutionStore((state) => state.clearOrderProcessingError);
  // const balance = useRiskStore((state) => state.balance); // Removed

  // Use real wallet balance for validation
  const fetchWallet = useWalletStore((state) => state.fetchWallet);
  const balance = useWalletStore((state) => state.availableBalance);
  const walletEquity = useWalletStore((state) => state.equity);
  const blockedBalance = useWalletStore((state) => state.blockedBalance);
  const accountState = useWalletStore((state) => state.accountState);
  const positions = usePositionsStore((state) => state.positions);
  const fetchPositions = usePositionsStore((state) => state.fetchPositions);
  const liveTokenPrice = useMarketStore((state) => {
    const token = selectedStock?.instrumentToken;
    if (!token) return 0;
    const price = Number(state.quotesByInstrument[token]?.price);
    return Number.isFinite(price) && price > 0 ? price : 0;
  });
  const liveSymbolPrice = useMarketStore((state) => {
    const symbol = selectedStock?.symbol;
    if (!symbol) return 0;
    const price = Number(state.selectPrice(symbol));
    return Number.isFinite(price) && price > 0 ? price : 0;
  });
  const liveUnderlyingPrice = useMarketStore((state) => {
    const price = Number(state.selectPrice(instrumentType));
    return Number.isFinite(price) && price > 0 ? price : 0;
  });

  useEffect(() => {
    fetchWallet().catch(() => undefined);
  }, [fetchWallet]);

  useEffect(() => {
    fetchPositions(true).catch(() => undefined);
  }, [fetchPositions]);

  // --- LOGIC FOR INSTRUMENT SELECTION ---

  // 1. Get relevant instruments based on selection
  const isEquityMode = instrumentMode === 'equity';

  // For derivatives, the page now passes repository-backed instruments as props.
  const allFutures = useMemo(() => (instrumentMode === 'futures' ? propInstruments : []), [instrumentMode, propInstruments]);
  const allOptions = useMemo(() => (instrumentMode === 'options' ? propInstruments : []), [instrumentMode, propInstruments]);

  // Filter based on InstrumentType (NIFTY, BANKNIFTY...)
  const filteredInstruments = useMemo(() => {
    if (isEquityMode) return propInstruments; // User is in Equity page, keep logic same

    // STRICT: Only look at source relevant to current mode
    let source: Stock[] = [];
    if (instrumentMode === 'futures') source = allFutures;
    if (instrumentMode === 'options') source = allOptions;

    if (instrumentType === "STOCK OPTIONS" || instrumentType === "STOCK FUTURES") {
      // Search-driven derivatives (stock options/futures).
      return source;
    }

    // Derivatives pages already pass instrument lists filtered by selected underlying.
    return source;
  }, [isEquityMode, propInstruments, instrumentMode, allFutures, allOptions, instrumentType]);


  // 2. Logic to Auto-Select Contract for Indices
  const isSearchDrivenDerivative = instrumentType === "STOCK OPTIONS" || instrumentType === "STOCK FUTURES";
  const showQuickFuturesSearch = instrumentMode === "futures";

  useEffect(() => {
    if (isEquityMode || isSearchDrivenDerivative) return;

    const expiries = Array.from(new Set(filteredInstruments
      .filter(i => i.expiryDate)
      .map(i => toExpiryIso(i.expiryDate))
      .filter(Boolean)
    )).sort();

    if (expiries.length === 0) {
      if (selectedExpiry) setSelectedExpiry("");
      return;
    }

    if (!selectedExpiry || !expiries.includes(selectedExpiry)) {
      setSelectedExpiry(expiries[0]);
    }
  }, [filteredInstruments, isEquityMode, isSearchDrivenDerivative, selectedExpiry]);


  // 3. Find the specific contract based on user selection
  useEffect(() => {
    if (isEquityMode || isSearchDrivenDerivative) return;

    let match: Stock | undefined;

    if (instrumentMode === 'futures') {
      // Find future with selected expiry
      match = filteredInstruments.find(i => toExpiryIso(i.expiryDate) === selectedExpiry);
      // Fallback to first if not found (e.g. expiry changed)
      if (!match && filteredInstruments.length > 0) match = filteredInstruments[0];
    } else {
      // Options: Need Expiry + Strike + CE/PE
      if (selectedExpiry && selectedStrike) {
        match = filteredInstruments.find(i =>
          toExpiryIso(i.expiryDate) === selectedExpiry &&
          parseOptionSymbol(i.symbol)?.strike === parseFloat(selectedStrike) &&
          parseOptionSymbol(i.symbol)?.type === optionType
        );
      }
    }

    if (match && !match.instrumentToken) {
      return;
    }

    if (match && match.symbol !== selectedStock?.symbol) {
      onStockSelect(match);
    }
  }, [isEquityMode, isSearchDrivenDerivative, instrumentMode, selectedExpiry, selectedStrike, optionType, filteredInstruments, onStockSelect, selectedStock]);


  // --- DERIVED DATA FOR UI SELECTORS ---
  const availableExpiries = useMemo(() => {
    const dates = filteredInstruments
      .map(i => parseExpiryDate(i.expiryDate))
      .filter((date): date is Date => Boolean(date));

    // Unique dates by time value
    const uniqueDates = Array.from(new Set(dates.map(d => d.getTime())))
      .map(time => new Date(time))
      .sort((a, b) => a.getTime() - b.getTime());

    return uniqueDates;
  }, [filteredInstruments]);

  const availableStrikes = useMemo(() => {
    if (instrumentMode !== 'options') return [];
    // Filter by expiry first
    const withExpiry = filteredInstruments.filter(i => toExpiryIso(i.expiryDate) === selectedExpiry);
    const strikes = new Set<number>();
    withExpiry.forEach(i => {
      const p = parseOptionSymbol(i.symbol);
      if (p) strikes.add(p.strike);
    });
    return Array.from(strikes).sort((a, b) => a - b);
  }, [filteredInstruments, instrumentMode, selectedExpiry]);


  // --- STANDARD FORM LOGIC ---
  const currentPrice = liveTokenPrice || liveSymbolPrice || liveUnderlyingPrice || selectedStock?.price || 0;
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
  const existingPosition = useMemo(() => {
    const token = selectedStock?.instrumentToken;
    if (!token) return null;
    return (
      positions.find(
        (position) =>
          String(position.instrumentToken || "") === token &&
          Number(position.quantity || 0) > 0
      ) || null
    );
  }, [positions, selectedStock?.instrumentToken]);

  const existingPositionQty = existingPosition ? Math.abs(Number(existingPosition.quantity || 0)) : 0;
  const existingPositionSide = existingPosition?.side || null;
  const fullExitGuardEnabled =
    instrumentMode === 'equity' || instrumentMode === 'futures' || instrumentMode === 'options';
  const isOppositeExitFlow =
    fullExitGuardEnabled &&
    existingPositionQty > 0 &&
    ((existingPositionSide === 'BUY' && side === 'SELL') ||
      (existingPositionSide === 'SELL' && side === 'BUY'));
  const effectiveQuantity = isOppositeExitFlow ? existingPositionQty : totalQuantity;
  const effectiveInputValue = isOppositeExitFlow
    ? Math.max(1, Math.round(effectiveQuantity / Math.max(1, lotSize)))
    : inputValue;
  const requiredMargin = (currentPrice * effectiveQuantity) / leverageValue;

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

  const isQuantityValid = isOppositeExitFlow ? existingPositionQty > 0 : inputValue > 0;
  const hasInstrumentToken = Boolean(selectedStock?.instrumentToken);
  const hasValidPrice = Number.isFinite(currentPrice) && currentPrice > 0;
  // Use real wallet balance for validation
  const hasSufficientMargin = requiredMargin <= balance;
  const balanceShortfall = requiredMargin - balance;
  const canTrade = selectedStock && hasInstrumentToken && hasValidPrice && !isOrderProcessing && isQuantityValid && hasSufficientMargin && isSlValid && isTargetValid;

  const handleSubmit = () => {
    if (isOrderProcessing) return;
    if (!selectedStock || !canTrade) return;
    if (!selectedStock.instrumentToken) {
      toast.error('Instrument routing key missing', {
        description: `Cannot place order for ${selectedStock.symbol} without instrumentToken.`,
      });
      return;
    }

    // Force blur on any focused input to ensure state is synced
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Small delay to let state update complete
    setTimeout(() => {
      setShowConfirmDialog(true);
    }, 50);
  };

  const confirmTrade = async () => {
    if (isOrderProcessing) return;
    if (!selectedStock) return;
    if (!selectedStock.instrumentToken) {
      toast.error('Instrument routing key missing', {
        description: `Cannot place order for ${selectedStock.symbol} without instrumentToken.`,
      });
      return;
    }

    console.log('[DEBUG TradingForm] confirmTrade called:', {
      instrumentToken: selectedStock.instrumentToken,
      quantity: quantity,
      inputValue: inputValue,
      lotSize: lotSize,
      totalQuantity: totalQuantity,
      selectedStock: selectedStock.symbol
    });

    try {
      await executeTrade({
        instrumentToken: selectedStock.instrumentToken,
        symbol: selectedStock.symbol,
        side,
        quantity: effectiveQuantity,
        entryPrice: currentPrice,
      }, lotSize, instrumentMode);

      toast.success('Trade Sent', {
        description: `${side} ${effectiveQuantity} units of ${selectedStock.symbol} at market.`,
      });

      // Close dialog first, then reset form after a small delay
      setShowConfirmDialog(false);

      // Reset form fields after dialog animation completes
      setTimeout(() => {
        setQuantity('1');
        setStopLoss('');
        setTarget('');
      }, 300);
    } catch (error) {
      const fallbackMessage = error instanceof Error ? error.message : 'Order placement failed';
      const message = fallbackMessage.includes('PARTIAL_EXIT_NOT_ALLOWED')
        ? 'Partial exit is disabled in paper trading mode.'
        : fallbackMessage;
      toast.error('Order Failed', { description: message });
    }
  };

  return (
    <TooltipProvider>
      <Card
        className={cn(
          "bg-card border-border h-full rounded-sm shadow-none flex flex-col min-h-0",
          sheetMode && "rounded-none border-0 bg-transparent",
        )}
      >
        {!isEquityMode && (
          <CardHeader className="pb-2 p-3">
            <InstrumentSelector
              value={instrumentType}
              onChange={setInstrumentType}
              hideStockOptions={instrumentMode === 'futures'}
              allowedValues={allowedInstrumentTypes}
            />
          </CardHeader>
        )}

        <CardHeader className={cn("pt-2 p-3", !isEquityMode && "pt-0", sheetMode && "p-4")}>
          {/* TradeTypeSelector removed - derived from route */}
          {isEquityMode && <CardTitle className="text-foreground">Place Order</CardTitle>}
        </CardHeader>

        <CardContent className={cn("space-y-4 p-3 flex-1 min-h-0 overflow-y-auto", sheetMode && "px-4 pb-24")}>
          {showQuickFuturesSearch && (
            <StockSearch
              selectedStock={selectedStock}
              onStockSelect={onStockSelect}
              instruments={allFutures}
              instrumentMode="futures"
              label="Quick Futures Search"
              placeholder="Search and pick any futures contract (index or stock)"
            />
          )}

          {/* SEARCH FOR EQUITY + SEARCH-DRIVEN DERIVATIVES */}
          {(isEquityMode || (instrumentMode === 'options' && isSearchDrivenDerivative)) && (
            <StockSearch
              selectedStock={selectedStock}
              onStockSelect={onStockSelect}
              instruments={
                instrumentType === "STOCK OPTIONS"
                  ? allOptions
                  : instrumentType === "STOCK FUTURES"
                    ? allFutures
                    : propInstruments
              }
              instrumentMode={
                instrumentType === "STOCK OPTIONS"
                  ? 'options'
                  : instrumentType === "STOCK FUTURES"
                    ? 'futures'
                    : instrumentMode
              }
              label={
                instrumentType === "STOCK OPTIONS"
                  ? "Search Stock Option"
                  : instrumentType === "STOCK FUTURES"
                    ? "Search Stock Future"
                    : "Select Stock"
              }
              placeholder={
                instrumentType === "STOCK OPTIONS"
                  ? "e.g. RELIANCE, TCS..."
                  : instrumentType === "STOCK FUTURES"
                    ? "e.g. RELIANCE, SBIN..."
                    : "Search stocks..."
              }
            />
          )}

          {/* INDEX F&O SELECTORS */}
          {!isEquityMode && !isSearchDrivenDerivative && (
            <div className="space-y-4 rounded-sm bg-muted/30 p-3 border border-border">
              {/* Expiry Selector */}
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Expiry</Label>
                <Select value={selectedExpiry} onValueChange={setSelectedExpiry}>
                  <SelectTrigger className="bg-input border-border h-8 rounded-sm text-xs">
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
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Strike Price</Label>
                    <Select value={selectedStrike} onValueChange={setSelectedStrike}>
                      <SelectTrigger className="bg-input border-border h-8 rounded-sm text-xs">
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
                    <ToggleGroup type="single" value={optionType} onValueChange={(v) => v && setOptionType(v as "CE" | "PE")} className="justify-start w-full gap-2">
                      <ToggleGroupItem value="CE" className="flex-1 h-7 text-xs data-[state=on]:bg-green-500/15 data-[state=on]:text-green-600 dark:data-[state=on]:bg-green-500/20 dark:data-[state=on]:text-green-400 border border-border data-[state=on]:border-green-500/30 hover:bg-muted hover:text-foreground transition-all">
                        CE (Call)
                      </ToggleGroupItem>
                      <ToggleGroupItem value="PE" className="flex-1 h-7 text-xs data-[state=on]:bg-red-500/15 data-[state=on]:text-red-600 dark:data-[state=on]:bg-red-500/20 dark:data-[state=on]:text-red-400 border border-border data-[state=on]:border-red-500/30 hover:bg-muted hover:text-foreground transition-all">
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
                <span className={cn("text-lg font-bold font-mono", selectedStock.change >= 0 ? "text-trade-buy" : "text-trade-sell")}>
                  ₹{currentPrice.toLocaleString()}
                </span>
              </div>

              <OrderTypeToggle side={side} onSideChange={setSide} />
              <div className="mt-6">
                {isOppositeExitFlow ? (
                  <div className="space-y-2 rounded-sm border border-border bg-muted/20 p-3">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Exit Full Position</Label>
                    <p className="text-sm font-semibold text-foreground">Position: {existingPositionQty} units</p>
                    <p className="text-xs text-muted-foreground">Exit: {existingPositionQty} units only</p>
                    {instrumentMode === 'options' && (
                      <div className="pt-1 text-xs text-muted-foreground space-y-1">
                        <p>Avg Premium: ₹{Number(existingPosition?.entryPrice || 0).toFixed(2)}</p>
                        <p>Current: ₹{Number(currentPrice || 0).toFixed(2)}</p>
                        <p>Unrealized PnL: ₹{Number(existingPosition?.currentPnL || 0).toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <QuantityInput quantity={quantity} onQuantityChange={setQuantity} lotSize={lotSize} />
                )}
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
                    className={cn("bg-input border-border h-8 rounded-sm text-xs font-mono", hasSl && !isSlValid && "border-trade-sell focus-visible:ring-trade-sell")}
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
                    className={cn("bg-input border-border h-8 rounded-sm text-xs font-mono", hasTarget && !isTargetValid && "border-trade-sell focus-visible:ring-trade-sell")}
                  />
                </div>
              </div>

              <div className="space-y-4 mt-6">
                <RiskPreview
                  selectedStock={selectedStock}
                  quantityValue={effectiveInputValue}
                  currentPrice={currentPrice}
                  balance={balance}
                />

                {/* Show Metrics only if Options mode */}
                {(tradeType === 'options' || (instrumentMode === 'options' && instrumentType === "STOCK OPTIONS")) && (
                  <>
                    <OptionsRiskMetrics
                      selectedStock={selectedStock}
                      quantityValue={effectiveInputValue}
                      currentPrice={currentPrice}
                      lotSize={lotSize}
                      side={side}
                    />
                    <OptionsPayoffChart
                      selectedStock={selectedStock}
                      quantityValue={effectiveInputValue}
                      currentPrice={currentPrice}
                      lotSize={lotSize}
                      side={side}
                    />
                  </>
                )}
              </div>

              <div className={cn("mt-4 space-y-4", sheetMode && "sticky bottom-0 border-t border-white/[0.08] bg-[#0d1422] py-3")}>
                <ProductTypeSelector productType={productType} onProductTypeChange={setProductType} />
                <LeverageSelector leverage={leverage} onLeverageChange={setLeverage} />
                <MarginDisplay selectedStock={selectedStock} currentPrice={currentPrice} requiredMargin={requiredMargin} balance={balance} />
                <PostTradeRiskPreview
                  projectedAdditionalMargin={requiredMargin}
                  equity={walletEquity}
                  blockedMargin={blockedBalance}
                  accountState={accountState}
                />

                <InsufficientFundsAlert requiredAmount={requiredMargin} />

                <Button
                  onClick={handleSubmit}
                  disabled={!canTrade}
                  variant="default"
                  className={cn(
                    'w-full min-h-11 text-sm font-bold uppercase tracking-widest transition-all rounded-sm shadow-none',
                    side === 'BUY'
                      ? 'bg-trade-buy hover:bg-trade-buy/90 text-white'
                      : 'bg-trade-sell hover:bg-trade-sell/90 text-white'
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

      <OrderProcessingDialog
        isProcessing={isOrderProcessing}
        errorMessage={orderProcessingError}
        onDismissError={clearOrderProcessingError}
      />

      <TradeConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        selectedStock={selectedStock}
        side={side}
        quantityValue={effectiveQuantity}
        currentPrice={currentPrice}
        requiredMargin={requiredMargin}
        productType={productType}
        leverageValue={leverageValue}
        isProcessing={isOrderProcessing}
        onConfirm={confirmTrade}
      />
    </TooltipProvider>
  );
}

