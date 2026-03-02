"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { CandlestickData, HistogramData, IChartApi, Time } from 'lightweight-charts';
import { Drawing, IndicatorConfig, useAnalysisStore } from '@/stores/trading/analysis.store';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMarketStore } from '@/stores/trading/market.store';
import { IndicatorsMenu } from './IndicatorsMenu';
import { ChartHeader } from './ChartHeader';
import { ChartOverlayLegend } from './ChartOverlayLegend';
import { ChartTradingPanel } from './ChartTradingPanel';
import { ChartLoadingIndicator } from './ChartLoadingIndicator';
import { debounce } from '@/lib/utils/debounce';
import { toCanonicalSymbol, toInstrumentKey } from '@/lib/market/symbol-normalization';
import { computeIndicators, scheduleIndicatorComputation, type ComputedIndicator } from '@/lib/analysis/indicator-engine';
import { trackAnalysisEvent } from '@/lib/analysis/telemetry';
import { Eye, EyeOff, Lock, Unlock, Trash2 } from 'lucide-react';
import { useTradeViewport } from '@/hooks/use-trade-viewport';

// Dynamic imports to avoid SSR issues with LWC
const BaseChart = dynamic(() => import('./BaseChart').then(mod => mod.BaseChart), { ssr: false });
const AnalysisOverlay = dynamic(() => import('../analysis/AnalysisOverlay').then(mod => mod.AnalysisOverlay), { ssr: false });

interface ChartContainerProps {
  symbol: string;
  headerSymbol?: string;
  instrumentKey?: string;
  onSearchClick?: () => void;
}

const EMPTY_INDICATORS: IndicatorConfig[] = [];
const EMPTY_DRAWINGS: Drawing[] = [];

// Reuse the generation logic from previous file for now (Phase 1)
const INITIAL_VISIBLE_BARS_BY_RANGE: Record<string, number> = {
  // Keep initial framing close to expected candle density per range.
  // Previous caps were too low for multi-day/month ranges, causing partial
  // windows that looked visually broken/disconnected.
  '1D': 220,  // 1m candles (thicker default candles for readability)
  '5D': 420,  // 5m candles (~375 for 5 sessions)
  '1M': 620,  // 15m candles (~500-600 for a month)
  '3M': 460,  // 1h candles (~350-450 for 3 months)
  '6M': 180,  // 1d candles
  '1Y': 300,  // 1d candles
  '3Y': 190,  // 1w candles
  '5Y': 280,  // 1w candles
};


export function ChartContainer({ symbol, headerSymbol, instrumentKey, onSearchClick }: ChartContainerProps) {
  const { isMobile } = useTradeViewport();
  const canonicalSymbol = toCanonicalSymbol(symbol);
  const analysisV2Enabled = process.env.NEXT_PUBLIC_ANALYSIS_V2 === "true";
  const {
    isAnalysisMode,
    setAnalysisMode,
    activeTool,
    timeframe,
    range,
    setChartStyleForSymbol,
    hotkeysEnabled,
    setActiveTool,
    selectedDrawingIds,
    setSelectedDrawingsLocked,
    deleteSelectedDrawings,
    setDrawingVisibility,
    updateIndicator,
    removeIndicator,
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
    hasMoreHistory,
    currentRequestId,
    simulatedSymbol,
    fetchMoreHistory,
    updateLiveCandle
  } = useMarketStore();
  const resolvedInstrumentKey = useMemo(() => {
    if (instrumentKey) {
      return toInstrumentKey(instrumentKey);
    }
    return toInstrumentKey(stocksBySymbol?.[canonicalSymbol]?.instrumentToken || canonicalSymbol);
  }, [instrumentKey, stocksBySymbol, canonicalSymbol]);
  const quotesByInstrument = useMarketStore((state) => state.quotesByInstrument);
  const selectQuote = useMarketStore((state) => state.selectQuote);
  const selectedStockSnapshot = stocksBySymbol?.[canonicalSymbol];
  const selectedQuote = useMemo(() => {
    const candidateKeys = [
      resolvedInstrumentKey,
      selectedStockSnapshot?.instrumentToken,
      canonicalSymbol,
      symbol,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    for (const raw of candidateKeys) {
      const normalized = toInstrumentKey(raw);
      const lookupKeys = new Set<string>([raw, normalized]);
      if (normalized) {
        lookupKeys.add(normalized.replace("|", ":"));
        lookupKeys.add(normalized.replace(":", "|"));
      }

      for (const key of lookupKeys) {
        const hit = quotesByInstrument[key];
        if (hit) return hit;
      }
    }

    return (
      selectQuote(resolvedInstrumentKey) ||
      selectQuote(selectedStockSnapshot?.instrumentToken || "") ||
      selectQuote(canonicalSymbol) ||
      null
    );
  }, [
    canonicalSymbol,
    quotesByInstrument,
    resolvedInstrumentKey,
    selectQuote,
    selectedStockSnapshot?.instrumentToken,
    symbol,
  ]);

  const indicators = useAnalysisStore((state) => state.symbolState[symbol]?.indicators ?? EMPTY_INDICATORS);
  const drawings = useAnalysisStore((state) => state.symbolState[symbol]?.drawings ?? EMPTY_DRAWINGS);
  const chartStyle = useAnalysisStore(
    (state) => state.chartStyleBySymbol[symbol] || state.symbolState[symbol]?.chartStyle || state.chartStyle
  );

  // Use state from store
  const data = historicalData;
  const volData = volumeData;

  const debouncedInitRef = useRef(
    debounce((sym: string, tf: string | undefined, rng: string | undefined, key: string) => {
      initializeSimulation(sym, tf, rng, key);
    }, 300)
  );

  // 1) Symbol subscription lifecycle.
  useEffect(() => {
    useAnalysisStore.getState().cancelDrawing();
    stopSimulation();
    startSimulation();

    return () => {
      stopSimulation();
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

    debouncedInitRef.current(symbol, timeframe, range, resolvedInstrumentKey);
  }, [symbol, timeframe, range, canonicalSymbol, resolvedInstrumentKey]);

  // Live candle updates are applied by use-market-stream.ts.
  useEffect(() => {
    // No action needed here - SSE hook handles it automatically
  }, [symbol, updateLiveCandle]);

  // Keep selected chart last price aligned with the same quote source used by watchlist/status bar.
  useEffect(() => {
    const quotePrice = Number(selectedQuote?.price);
    const snapshotPrice = Number(selectedStockSnapshot?.price);
    const effectivePrice =
      Number.isFinite(quotePrice) && quotePrice > 0
        ? quotePrice
        : Number.isFinite(snapshotPrice) && snapshotPrice > 0
        ? snapshotPrice
        : 0;
    if (!Number.isFinite(effectivePrice) || effectivePrice <= 0) return;

    const state = useMarketStore.getState();
    if (state.simulatedInstrumentKey !== resolvedInstrumentKey || state.historicalData.length === 0) return;

    const lastIndex = state.historicalData.length - 1;
    const lastCandle = state.historicalData[lastIndex];
    if (!lastCandle) return;

    const currentClose = Number(lastCandle.close);
    if (Number.isFinite(currentClose) && Math.abs(currentClose - effectivePrice) < 0.0001) {
      if (Number(state.livePrice) !== effectivePrice) {
        useMarketStore.setState({ livePrice: effectivePrice });
      }
      return;
    }

    const patchedCandle = {
      ...lastCandle,
      close: effectivePrice,
      high: Math.max(Number(lastCandle.high), effectivePrice),
      low: Math.min(Number(lastCandle.low), effectivePrice),
    };

    useMarketStore.setState({
      historicalData: [...state.historicalData.slice(0, -1), patchedCandle],
      livePrice: effectivePrice,
    });
  }, [resolvedInstrumentKey, selectedQuote?.price, selectedStockSnapshot?.price]);
  const [computedIndicators, setComputedIndicators] = useState<ComputedIndicator[]>([]);
  const [hoveredCandle, setHoveredCandle] = useState<{
    time?: number;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);

  useEffect(() => {
    setHoveredCandle(null);
  }, [symbol, resolvedInstrumentKey, range]);

  useEffect(() => {
    if (data.length === 0 || indicators.length === 0) {
      setComputedIndicators((previous) => (previous.length === 0 ? previous : []));
      return;
    }

    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

    const scheduler = scheduleIndicatorComputation(
      () =>
        computeIndicators({
          symbol,
          instrumentKey: resolvedInstrumentKey,
          candles: data as any,
          indicators,
        }),
      (result) => {
        const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        const elapsedMs = endedAt - startedAt;
        if (elapsedMs > 40) {
          trackAnalysisEvent({
            name: "indicator_compute_slow",
            level: "warn",
            payload: {
              symbol,
              instrumentKey: resolvedInstrumentKey,
              indicatorCount: indicators.length,
              candleCount: data.length,
              elapsedMs: Math.round(elapsedMs),
            },
          });
        }
        setComputedIndicators(result);
      }
    );

    return () => scheduler.cancel();
  }, [data, indicators, symbol, resolvedInstrumentKey]);

  const chartProps = {
    data,
    volumeData: volData,
    indicators: computedIndicators,
    drawings,
    activeTool,
    chartStyle,
    showVolume: true,
  };

  const latestCandle = useMemo(() => {
    if (!historicalData.length) return null;
    const last = historicalData[historicalData.length - 1] as any;
    return {
      time: Number(last.time),
      open: Number(last.open),
      high: Number(last.high),
      low: Number(last.low),
      close: Number(last.close),
      volume: Number(volumeData?.[volumeData.length - 1]?.value),
    };
  }, [historicalData, volumeData]);

  const legendData = hoveredCandle
    ? {
        ...hoveredCandle,
        volume: latestCandle?.volume,
      }
    : latestCandle;
  const activeChartStyle = chartStyle;
  const legendUpColor = activeChartStyle === "HEIKIN_ASHI" ? "#22C55E" : "#089981";
  const legendDownColor = activeChartStyle === "HEIKIN_ASHI" ? "#EF4444" : "#F23645";

  // State for Instant Order Panel
  const [showTradingPanel, setShowTradingPanel] = useState(false);
  
  // State for Chart API (for actions like screenshot)
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  const initialFrameRequestIdRef = useRef<number | null>(null);
  const warmupRequestIdRef = useRef<number | null>(null);
  const ONE_DAY_VISIBLE_FALLBACK_BARS = 220;
  const ONE_DAY_TARGET_MULTIPLIER = 1.2;
  const ONE_DAY_WARMUP_MAX_PAGES = 2;

  const frameChartToLatest = useCallback(() => {
    if (!chartApi || historicalData.length === 0) return false;
    try {
      const timeScale = chartApi.timeScale();
      const normalizedRange = (range || '1D').toUpperCase();
      const targetVisibleBars = INITIAL_VISIBLE_BARS_BY_RANGE[normalizedRange] ?? ONE_DAY_VISIBLE_FALLBACK_BARS;
      const chartWidth = Number((chartApi.options() as any)?.width);
      const minPixelsPerBar = normalizedRange === '1D' ? 4 : 3;
      const widthCappedBars =
        Number.isFinite(chartWidth) && chartWidth > 0
          ? Math.floor(chartWidth / minPixelsPerBar)
          : targetVisibleBars;
      const desiredVisibleBars = Math.min(targetVisibleBars, Math.max(40, widthCappedBars));
      const visibleBars = Math.max(40, Math.min(desiredVisibleBars, historicalData.length));
      const rightOffsetBars = normalizedRange === '1D' ? 12 : 8;

      // Use logical index range so initial candle width is consistent regardless of timestamp gaps.
      const to = Math.max(historicalData.length - 1 + rightOffsetBars, rightOffsetBars);
      const from = Math.max(0, to - visibleBars);

      timeScale.setVisibleLogicalRange({ from, to });
      timeScale.scrollToRealTime();
      return true;
    } catch (error) {
      console.warn('Initial chart framing failed:', error);
      return false;
    }
  }, [chartApi, historicalData.length, range]);

  // Frame once per request cycle after first dataset is ready.
  useEffect(() => {
    if (!chartApi || historicalData.length === 0 || currentRequestId <= 0) return;
    if (initialFrameRequestIdRef.current === currentRequestId) return;

    const timer = window.setTimeout(() => {
      const framed = frameChartToLatest();
      if (framed) {
        initialFrameRequestIdRef.current = currentRequestId;
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [chartApi, historicalData.length, currentRequestId, frameChartToLatest]);

  // 1D warm-up: fetch limited older pages so left side does not look empty on first load.
  useEffect(() => {
    if (!chartApi || historicalData.length === 0 || currentRequestId <= 0) return;

    const normalizedRange = (range || '1D').toUpperCase();
    if (normalizedRange !== '1D') return;
    if (!hasMoreHistory) return;
    if (isFetchingHistory && isInitialLoad) return;
    if (simulatedSymbol && toCanonicalSymbol(simulatedSymbol) !== canonicalSymbol) return;
    if (warmupRequestIdRef.current === currentRequestId) return;

    warmupRequestIdRef.current = currentRequestId;
    let cancelled = false;

    const warmup = async () => {
      const logicalRange = chartApi.timeScale().getVisibleLogicalRange();
      const visibleBars =
        logicalRange &&
        Number.isFinite(logicalRange.from) &&
        Number.isFinite(logicalRange.to) &&
        logicalRange.to > logicalRange.from
          ? Math.ceil(logicalRange.to - logicalRange.from)
          : ONE_DAY_VISIBLE_FALLBACK_BARS;
      const targetCandles = Math.ceil(visibleBars * ONE_DAY_TARGET_MULTIPLIER);

      let pagesLoaded = 0;

      while (!cancelled) {
        const marketState = useMarketStore.getState();
        const analysisRange = (useAnalysisStore.getState().range || '1D').toUpperCase();
        const activeSymbol = toCanonicalSymbol(marketState.simulatedSymbol || '');

        if (marketState.currentRequestId !== currentRequestId) {
          break;
        }
        if (analysisRange !== normalizedRange) {
          break;
        }
        if (activeSymbol && activeSymbol !== canonicalSymbol) {
          break;
        }
        if (marketState.historicalData.length >= targetCandles) {
          break;
        }
        if (!marketState.hasMoreHistory) {
          break;
        }
        if (pagesLoaded >= ONE_DAY_WARMUP_MAX_PAGES) {
          break;
        }

        const firstCandle = marketState.historicalData[0];
        const firstCandleTime = Number(firstCandle?.time);
        if (!Number.isFinite(firstCandleTime)) {
          break;
        }

        pagesLoaded += 1;

        await marketState.fetchMoreHistory(symbol, normalizedRange, firstCandleTime, resolvedInstrumentKey);
      }

      if (!cancelled) {
        frameChartToLatest();
      }
    };

    void warmup();

    return () => {
      cancelled = true;
    };
  }, [
    chartApi,
    historicalData.length,
    currentRequestId,
    range,
    symbol,
    resolvedInstrumentKey,
    canonicalSymbol,
    frameChartToLatest,
    isFetchingHistory,
    isInitialLoad,
    hasMoreHistory,
    simulatedSymbol,
  ]);

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
    setAnalysisMode(true);
  };

  useEffect(() => {
    if (!analysisV2Enabled || !hotkeysEnabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingTarget =
        tag === "input" || tag === "textarea" || tag === "select" || Boolean(target?.isContentEditable);
      if (isTypingTarget) return;

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          useAnalysisStore.getState().redoDrawing(symbol);
        } else {
          useAnalysisStore.getState().undoDrawing(symbol);
        }
        return;
      }

      if (event.altKey && key === "t") {
        event.preventDefault();
        setActiveTool("text");
        return;
      }

      if (key === "delete" || key === "backspace") {
        if (selectedDrawingIds.length > 0) {
          event.preventDefault();
          deleteSelectedDrawings(symbol);
        }
        return;
      }

      if (key === "escape") {
        const state = useAnalysisStore.getState();
        if (state.interactionState.status === "drawing") {
          state.cancelDrawing();
        } else {
          state.setSelectedDrawings([]);
          state.setActiveTool("cursor");
        }
        return;
      }

      const toolMap: Record<string, any> = {
        v: "cursor",
        c: "crosshair",
        t: "trendline",
        r: "rectangle",
        h: "horizontal-line",
      };
      const mappedTool = toolMap[key];
      if (mappedTool) {
        event.preventDefault();
        setActiveTool(mappedTool);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [analysisV2Enabled, hotkeysEnabled, setActiveTool, symbol, selectedDrawingIds.length, deleteSelectedDrawings]);

  // Infinite Scroll Handler (Memoized to prevent BaseChart re-creation loop)
  const handleLoadMore = useCallback(async () => {
    if (historicalData.length === 0) {
        return;
    }
    
    const firstCandle = historicalData[0];
    const currentRange = (range || '1D').toUpperCase();

    await fetchMoreHistory(symbol, currentRange, firstCandle.time as number, resolvedInstrumentKey);
  }, [historicalData, symbol, range, fetchMoreHistory, resolvedInstrumentKey]); // ✅ Stable dependencies only

  const selectedDrawings = useMemo(
    () => drawings.filter((drawing: any) => selectedDrawingIds.includes(drawing.id)),
    [drawings, selectedDrawingIds]
  );
  const hasSelection = selectedDrawings.length > 0;
  const allVisible = hasSelection && selectedDrawings.every((drawing: any) => drawing.visible !== false);
  const allLocked = hasSelection && selectedDrawings.every((drawing: any) => drawing.locked === true);
 
  const leftToolbar = (
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
                onClick={() => setActiveTool(tool.id as any)}
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

        <div className="w-6 h-px bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={!hasSelection}
              onClick={() => {
                selectedDrawings.forEach((drawing: any) => {
                  setDrawingVisibility(symbol, drawing.id, !allVisible);
                });
              }}
              className={`p-1.5 rounded-sm transition-colors ${
                hasSelection ? 'text-muted-foreground hover:bg-accent hover:text-foreground' : 'text-muted-foreground/40 cursor-not-allowed'
              }`}
            >
              {allVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10} className="bg-popover text-popover-foreground text-xs px-2 py-1">
            <p>{allVisible ? "Hide Selected" : "Show Selected"}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={!hasSelection}
              onClick={() => setSelectedDrawingsLocked(symbol, !allLocked)}
              className={`p-1.5 rounded-sm transition-colors ${
                hasSelection ? 'text-muted-foreground hover:bg-accent hover:text-foreground' : 'text-muted-foreground/40 cursor-not-allowed'
              }`}
            >
              {allLocked ? <Unlock size={16} /> : <Lock size={16} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10} className="bg-popover text-popover-foreground text-xs px-2 py-1">
            <p>{allLocked ? "Unlock Selected" : "Lock Selected"}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={!hasSelection}
              onClick={() => deleteSelectedDrawings(symbol)}
              className={`p-1.5 rounded-sm transition-colors ${
                hasSelection ? 'text-muted-foreground hover:bg-accent hover:text-destructive' : 'text-muted-foreground/40 cursor-not-allowed'
              }`}
            >
              <Trash2 size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10} className="bg-popover text-popover-foreground text-xs px-2 py-1">
            <p>Delete Selected</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );

  const renderChartArea = () => (
    <div className="relative flex-1 h-full min-w-0 bg-transparent flex flex-col">
      {showTradingPanel && <ChartTradingPanel symbol={symbol} />}

      <div className="flex-1 w-full min-h-0 relative">
        {isFetchingHistory && isInitialLoad && (
          <div className="absolute inset-0 z-50 bg-background/50 flex items-center justify-center">
            <ChartLoadingIndicator />
          </div>
        )}

        {!isFetchingHistory && historicalData.length === 0 && (
          <div className="absolute inset-0 z-40 flex items-center justify-center text-muted-foreground bg-background/50">
            No historical data available for {symbol}
          </div>
        )}

        {historicalData.length > 0 && (
          <>
            <BaseChart
              {...chartProps}
              symbol={symbol}
              instrumentKey={resolvedInstrumentKey}
              range={range}
              onChartReady={setChartApi}
              onLoadMore={handleLoadMore}
              onHoverCandleChange={(candle) => {
                if (!candle) {
                  setHoveredCandle(null);
                  return;
                }
                setHoveredCandle({
                  time: Number(candle.time as number),
                  open: Number((candle as any).open),
                  high: Number((candle as any).high),
                  low: Number((candle as any).low),
                  close: Number((candle as any).close),
                });
              }}
            />
            <ChartOverlayLegend
              symbol={headerSymbol || symbol}
              data={legendData}
              upColor={legendUpColor}
              downColor={legendDownColor}
              indicators={indicators.map((indicator) => ({
                id: indicator.id,
                label: indicator.type,
                color: indicator.display.color,
                visible: indicator.display.visible,
              }))}
              onToggleIndicatorVisibility={(id) => {
                const target = indicators.find((indicator) => indicator.id === id);
                if (!target) return;
                updateIndicator(symbol, id, {
                  display: {
                    ...target.display,
                    visible: !target.display.visible,
                  },
                });
              }}
              onRemoveIndicator={(id) => removeIndicator(symbol, id)}
            />
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative w-full h-full group">
      {!isAnalysisMode && (
        <div className="relative w-full h-full flex flex-col">
          <ChartHeader
            symbol={symbol}
            displaySymbol={headerSymbol}
            chartStyle={chartStyle}
            compact={isMobile}
            isInstantOrderActive={showTradingPanel}
            onToggleInstantOrder={() => setShowTradingPanel(!showTradingPanel)}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onScreenshot={handleScreenshot}
            onMaximize={handleMaximize}
            onSearchClick={onSearchClick}
            onChartStyleChange={(style) => setChartStyleForSymbol(symbol, style)}
            isLoading={isFetchingHistory && isInitialLoad}
            isFullscreen={false}
          />

          <div className="flex flex-1 relative min-h-0">
            {leftToolbar}
            {renderChartArea()}
          </div>
        </div>
      )}

      {isAnalysisMode && (
        <AnalysisOverlay>
          <div className="relative w-full h-full flex flex-col">
            <ChartHeader
              symbol={symbol}
              displaySymbol={headerSymbol}
              chartStyle={chartStyle}
              compact={isMobile}
              isInstantOrderActive={showTradingPanel}
              onToggleInstantOrder={() => setShowTradingPanel(!showTradingPanel)}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onScreenshot={handleScreenshot}
              onMaximize={() => setAnalysisMode(false)}
              onSearchClick={onSearchClick}
              onChartStyleChange={(style) => setChartStyleForSymbol(symbol, style)}
              isLoading={isFetchingHistory && isInitialLoad}
              isFullscreen={true}
            />

            <div className="flex flex-1 relative min-h-0">
              {leftToolbar}
              {renderChartArea()}
            </div>
          </div>
        </AnalysisOverlay>
      )}
    </div>
  );
}
