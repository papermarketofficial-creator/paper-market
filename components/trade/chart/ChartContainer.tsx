"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { CandlestickData, HistogramData, Time } from 'lightweight-charts';
import { useAnalysisStore } from '@/stores/trading/analysis.store';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SMA, RSI, MACD, EMA, BollingerBands } from 'technicalindicators';
import { useMarketStore } from '@/stores/trading/market.store';
import { IndicatorsMenu } from './IndicatorsMenu';
import { ChartHeader } from './ChartHeader';
import { ChartOverlayLegend } from './ChartOverlayLegend';
import { ChartTradingPanel } from './ChartTradingPanel';
import { ChartLoadingIndicator } from './ChartLoadingIndicator';
import { debounce } from '@/lib/utils/debounce';
import { toCanonicalSymbol, toInstrumentKey } from '@/lib/market/symbol-normalization';

// Dynamic imports to avoid SSR issues with LWC
const BaseChart = dynamic(() => import('./BaseChart').then(mod => mod.BaseChart), { ssr: false });
const AnalysisOverlay = dynamic(() => import('../analysis/AnalysisOverlay').then(mod => mod.AnalysisOverlay), { ssr: false });

interface ChartContainerProps {
  symbol: string;
  onSearchClick?: () => void;
}

// Reuse the generation logic from previous file for now (Phase 1)


export function ChartContainer({ symbol, onSearchClick }: ChartContainerProps) {
  const canonicalSymbol = toCanonicalSymbol(symbol);
  const {
    isAnalysisMode,
    activeTool,
    getIndicators,
    getDrawings,
    timeframe,
    range // Read Range
  } = useAnalysisStore();

  const {
    historicalData,
    volumeData,
    stocksBySymbol,
    initializeSimulation,
    startSimulation,
    stopSimulation,
    isFetchingHistory,
    isInitialLoad,
    fetchMoreHistory,
    updateLiveCandle
  } = useMarketStore();
  const resolvedInstrumentKey = useMemo(
    () => toInstrumentKey(stocksBySymbol?.[canonicalSymbol]?.instrumentToken || canonicalSymbol),
    [stocksBySymbol, canonicalSymbol]
  );
  const selectedQuote = useMarketStore((state) => state.quotesByInstrument[resolvedInstrumentKey]);

  const indicators = getIndicators(symbol);
  const drawings = getDrawings(symbol);

  // Use state from store
  const data = historicalData;
  const volData = volumeData;

  const debouncedInitRef = useRef(
    debounce((sym: string, tf: string | undefined, rng: string | undefined) => {
      initializeSimulation(sym, tf, rng);
    }, 300)
  );

  const debouncedSubscribeRef = useRef(
    debounce(async (sym: string) => {
      try {
        const res = await fetch('/api/v1/market/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: [sym] })
        });

        if (!res.ok) {
          const details = await res.text().catch(() => '');
          throw new Error(`Subscribe failed (${res.status}) ${details}`);
        }
      } catch (err) {
        console.error('Failed to subscribe:', err);
      }
    }, 250)
  );

  // 1) Symbol subscription lifecycle.
  useEffect(() => {
    useAnalysisStore.getState().cancelDrawing();
    stopSimulation();
    startSimulation();

    debouncedSubscribeRef.current(symbol);

    return () => {
      stopSimulation();
      fetch('/api/v1/market/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [symbol] })
      })
        .then(async (res) => {
          if (!res.ok) {
            const details = await res.text().catch(() => '');
            throw new Error(`Unsubscribe failed (${res.status}) ${details}`);
          }
        })
        .catch((err) => console.error('Failed to unsubscribe:', err));
    };
  }, [symbol, startSimulation, stopSimulation]);

  // 2) History lifecycle.
  useEffect(() => {
    useMarketStore.setState((state: any) => ({
      historicalData: [],
      volumeData: [],
      isFetchingHistory: true,
      isInitialLoad: true,
      simulatedSymbol: canonicalSymbol,
      simulatedInstrumentKey: resolvedInstrumentKey,
      currentRequestId: (state.currentRequestId || 0) + 1,
    }));

    debouncedInitRef.current(symbol, timeframe, range);
  }, [symbol, timeframe, range, canonicalSymbol, resolvedInstrumentKey]);

  // Live candle updates are applied by use-market-stream.ts.
  useEffect(() => {
    // No action needed here - SSE hook handles it automatically
  }, [symbol, updateLiveCandle]);

  // Keep selected chart last price aligned with the same quote source used by watchlist/status bar.
  useEffect(() => {
    const quotePrice = Number(selectedQuote?.price);
    if (!Number.isFinite(quotePrice) || quotePrice <= 0) return;

    const state = useMarketStore.getState();
    if (state.simulatedInstrumentKey !== resolvedInstrumentKey || state.historicalData.length === 0) return;

    const lastIndex = state.historicalData.length - 1;
    const lastCandle = state.historicalData[lastIndex];
    if (!lastCandle) return;

    const currentClose = Number(lastCandle.close);
    if (Number.isFinite(currentClose) && Math.abs(currentClose - quotePrice) < 0.0001) {
      if (Number(state.livePrice) !== quotePrice) {
        useMarketStore.setState({ livePrice: quotePrice });
      }
      return;
    }

    const patchedCandle = {
      ...lastCandle,
      close: quotePrice,
      high: Math.max(Number(lastCandle.high), quotePrice),
      low: Math.min(Number(lastCandle.low), quotePrice),
    };

    useMarketStore.setState({
      historicalData: [...state.historicalData.slice(0, -1), patchedCandle],
      livePrice: quotePrice,
    });
  }, [resolvedInstrumentKey, selectedQuote?.price]);
  // ... (Indicators calc remains same) ...
  // Indictor logic omitted for brevity in replace, only targeting Data Fetching block?
  // No, I need to keep the file valid. I will target the top part only.

  // 3. Event Handlers
  // Removed handleChartClick as DrawingManager handles it now.

  // chartProps definition moved to end of component

  // 2. Indicator Calculation (Memoized & Safe)
  const computedIndicators = useMemo(() => {
    if (data.length === 0) return [];

    const closes = data.map(d => d.close as number);

    return indicators.map(ind => {
      // Safety Guard: Insufficient data
      const period = ind.period || 14;
      if (data.length < period) return { config: ind, data: [] };

      let results: any = [];

      try {
        if (ind.type === 'SMA') {
          const sma = SMA.calculate({ period, values: closes });
          results = sma.map((val, i) => {
            const dataIndex = i + period - 1;
            if (!data[dataIndex]) return null;
            return { time: data[dataIndex].time, value: val };
          }).filter(Boolean);
          return { config: ind, data: results };
        }
        else if (ind.type === 'EMA') {
          const ema = EMA.calculate({ period, values: closes });
          results = ema.map((val, i) => {
            const dataIndex = i + period - 1;
            if (!data[dataIndex]) return null;
            return { time: data[dataIndex].time, value: val };
          }).filter(Boolean);
          return { config: ind, data: results };
        }
        else if (ind.type === 'BB') {
          const bb = BollingerBands.calculate({ period, stdDev: 2, values: closes });
          // BB returns { middle, upper, lower }
          // We need to map this to 3 series or similar. For simplicity, we'll return complex data and handle in BaseChart
          // Or simpler: just return Main Line (Middle) here? No, user wants Bands.
          // We'll structure it like MACD (series object)

          results = bb.map((val, i) => {
            const dataIndex = i + period - 1;
            if (!data[dataIndex]) return null;
            return {
              time: data[dataIndex].time,
              middle: val.middle,
              upper: val.upper,
              lower: val.lower
            };
          }).filter(Boolean);

          // Extract into separate arrays for lightweight-charts
          const middle = results.map((r: any) => ({ time: r.time, value: r.middle }));
          const upper = results.map((r: any) => ({ time: r.time, value: r.upper }));
          const lower = results.map((r: any) => ({ time: r.time, value: r.lower }));

          return {
            config: ind,
            data: middle, // Default to middle for generic renderers
            series: {
              middle,
              upper,
              lower
            }
          };
        }
        else if (ind.type === 'RSI') {
          const rsi = RSI.calculate({ period, values: closes });
          results = rsi.map((val, i) => {
            const dataIndex = i + period;
            if (!data[dataIndex]) return null;
            return { time: data[dataIndex].time, value: val };
          }).filter(Boolean);
          return { config: ind, data: results };
        }
        else if (ind.type === 'MACD') {
          const fast = ind.fastPeriod || 12;
          const slow = ind.slowPeriod || 26;
          const signal = ind.signalPeriod || 9;

          if (data.length < (slow + signal)) return { config: ind, data: [] };

          const macd = MACD.calculate({
            values: closes,
            fastPeriod: fast,
            slowPeriod: slow,
            signalPeriod: signal,
            SimpleMAOscillator: false,
            SimpleMASignal: false
          });

          // Align results
          const offset = data.length - macd.length;

          const mapSafe = (val: number, i: number) => {
            const d = data[i + offset];
            return d ? { time: d.time, value: val } : null;
          };

          const macdData = macd.map((val, i) => val.MACD !== undefined ? mapSafe(val.MACD, i) : null).filter(Boolean);
          const signalData = macd.map((val, i) => val.signal !== undefined ? mapSafe(val.signal, i) : null).filter(Boolean);
          const histogramData = macd.map((val, i) => {
            const d = data[i + offset];
            return d ? {
              time: d.time,
              value: val.histogram,
              color: (val.histogram || 0) > 0 ? '#26a69a' : '#ef5350'
            } : null;
          }).filter(Boolean);

          return {
            config: ind,
            data: macdData,
            series: {
              macd: macdData,
              signal: signalData,
              histogram: histogramData
            }
          };
        }
      } catch (e) {
        console.error("Indicator Calc Error", e);
        return { config: ind, data: [] };
      }

      return { config: ind, data: [] };
    });
  }, [data, indicators]);

  const chartProps = {
    data,
    volumeData: volData,
    indicators: computedIndicators,
    drawings,
    activeTool,
  };

  // State for Instant Order Panel
  const [showTradingPanel, setShowTradingPanel] = useState(false);
  
  // State for Chart API (for actions like screenshot)
  const [chartApi, setChartApi] = useState<any>(null);

  // Handlers
  const handleUndo = () => useAnalysisStore.getState().undoDrawing(symbol);
  const handleRedo = () => useAnalysisStore.getState().redoDrawing(symbol);
  
  const handleScreenshot = () => {
    if (chartApi) {
        const canvas = chartApi.takeScreenshot();
        // Convert to image and download
        const url = canvas.toDataURL();
        const a = document.createElement('a');
        a.href = url;
        a.download = `${symbol}_chart_${Date.now()}.png`;
        a.click();
    }
  };

  const handleMaximize = () => {
     if (!document.fullscreenElement) {
         document.documentElement.requestFullscreen();
     } else {
         document.exitFullscreen();
     }
  };

  // Infinite Scroll Handler (Memoized to prevent BaseChart re-creation loop)
  const handleLoadMore = useCallback(() => {
    console.log(`🔄 handleLoadMore called: historicalData.length=${historicalData.length}`);
    
    // ✅ Removed isFetchingHistory check - store's fetchMoreHistory has internal guard
    if (historicalData.length === 0) {
        console.log('⏸️ handleLoadMore: No historical data yet, skipping');
        return;
    }
    
    const firstCandle = historicalData[0];
    const currentRange = range || '1d';
    
    const firstCandleTime = new Date((firstCandle.time as number) * 1000).toISOString();
    console.log(`🔄 handleLoadMore: Loading more data before ${firstCandleTime}`);
    console.log(`🔄 handleLoadMore: Parameters - symbol=${symbol}, range=${currentRange}, endTime=${firstCandle.time}`);
    
    fetchMoreHistory(symbol, currentRange, firstCandle.time as number);
  }, [historicalData, symbol, range, fetchMoreHistory]); // ✅ Stable dependencies only
 
  return (
    <div className="relative w-full h-full group">
      {/* Normal View */}
      {!isAnalysisMode && (
        <div className="relative w-full h-full flex flex-col">
          {/* Top Toolbar (Upstox Style) */}
          <ChartHeader 
            symbol={symbol} 
            isInstantOrderActive={showTradingPanel}
            onToggleInstantOrder={() => setShowTradingPanel(!showTradingPanel)}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onScreenshot={handleScreenshot}
            onMaximize={handleMaximize}
            onSearchClick={onSearchClick}
            isLoading={isFetchingHistory && isInitialLoad} // Show loading only during initial chart load
          />

          <div className="flex flex-1 relative min-h-0">
             {/* Left Vertical Toolbar */}
             <TooltipProvider delayDuration={0}>
               <div className="w-10 bg-card border-r border-border flex flex-col items-center py-4 gap-4 z-20 shrink-0">
                 {[
                   { id: 'crosshair', label: 'Crosshair', icon: <><path d="M12 3v18"/><path d="M3 12h18"/></> },
                   { id: 'cursor', label: 'Cursor', icon: <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/> },
                   { id: 'trendline', label: 'Trendline', icon: <line x1="2" y1="2" x2="22" y2="22"/> },
                   { id: 'ray', label: 'Ray', icon: <><circle cx="12" cy="12" r="2"/><path d="M12 12l10-6"/></> },
                   { id: 'horizontal-line', label: 'Horizontal Line', icon: <line x1="3" y1="12" x2="21" y2="12"/> },
                   { id: 'rectangle', label: 'Rectangle', icon: <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/> },
                   { id: 'text', label: 'Text', icon: <><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></> }
                 ].map((tool) => (
                    <Tooltip key={tool.id}>
                      <TooltipTrigger asChild>
                         <div 
                           onClick={() => useAnalysisStore.getState().setActiveTool(tool.id as any)}
                           className={`p-1.5 rounded-sm cursor-pointer transition-colors ${activeTool === tool.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                         >
                           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                             {tool.icon}
                           </svg>
                         </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={10} className="bg-popover text-popover-foreground text-xs px-2 py-1">
                        <p>{tool.label}</p>
                      </TooltipContent>
                    </Tooltip>
                 ))}
               </div>
             </TooltipProvider>

             {/* Chart Area */}
             <div className="relative flex-1 h-full min-w-0 bg-transparent flex flex-col">
               {/* Trading Panel (Floating - Togglable) */}
               {showTradingPanel && <ChartTradingPanel symbol={symbol} />}
               

               {/* Main Chart */}
               <div className="flex-1 w-full min-h-0 relative">
                  {/* Loading Overlay - ONLY on initial load */}
                  {isFetchingHistory && isInitialLoad && (
                      <div className="absolute inset-0 z-50 bg-background/50 flex items-center justify-center">
                          <ChartLoadingIndicator />
                      </div>
                  )}

                  {/* Empty State */}
                  {!isFetchingHistory && historicalData.length === 0 && (
                      <div className="absolute inset-0 z-40 flex items-center justify-center text-muted-foreground bg-background/50">
                          No historical data available for {symbol}
                      </div>
                  )}

                  {historicalData.length > 0 && (
                   <BaseChart 
                     {...chartProps} 
                     height={500}
                     symbol={symbol} 
                     instrumentKey={resolvedInstrumentKey}
                     range={range} // ✅ Pass range for dynamic X-axis formatting
                     onChartReady={setChartApi}
                     onLoadMore={handleLoadMore}
                   />
                   )}
               </div>

              
             </div>
          </div>
        </div>
      )}

      {/* Analysis Overlay View */}
      {isAnalysisMode && (
        <AnalysisOverlay symbol={symbol}>
          <BaseChart {...chartProps} height={window.innerHeight - 60} symbol={symbol} instrumentKey={resolvedInstrumentKey} />
        </AnalysisOverlay>
      )}
    </div>
  );
}

