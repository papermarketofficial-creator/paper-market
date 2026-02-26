"use client";
import { useEffect, useRef, forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, CandlestickData, HistogramSeries, HistogramData, CrosshairMode, LineSeries, AreaSeries } from 'lightweight-charts';
import { ChartStyle, IndicatorConfig } from '@/stores/trading/analysis.store';
import { DrawingManager } from './overlays/DrawingManager';
import { ChartController } from '@/lib/trading/chart-controller';
import { chartRegistry } from '@/lib/trading/chart-registry';
import { toCanonicalSymbol, toInstrumentKey } from '@/lib/market/symbol-normalization';
import { trackAnalysisEvent } from '@/lib/analysis/telemetry';

interface BaseChartProps {
  data: CandlestickData[];
  volumeData?: HistogramData[];
  indicators?: {
    config: IndicatorConfig;
    data: any[];
    series?: {
      // MACD
      macd?: any[];
      signal?: any[];
      histogram?: any[];
      // Bollinger Bands
      middle?: any[];
      upper?: any[];
      lower?: any[];
    };
  }[];
  height?: number;
  autoResize?: boolean;
  symbol: string;
  instrumentKey?: string;
  range?: string;
  chartStyle?: ChartStyle;
  showVolume?: boolean;
  onHotkeyAction?: (action: string) => void;
  onHoverCandleChange?: (candle: CandlestickData | null) => void;
  onChartReady?: (api: IChartApi) => void;
  onLoadMore?: () => Promise<void> | void;
}

export interface BaseChartRef {
  chart: IChartApi | null;
  container: HTMLDivElement | null;
}

export const BaseChart = forwardRef<BaseChartRef, BaseChartProps>(({
  data,
  volumeData,
  indicators = [],
  height,
  autoResize = true,
  symbol,
  instrumentKey,
  range,
  chartStyle = "CANDLE",
  showVolume = true,
  onHoverCandleChange,
  onChartReady,
  onLoadMore 
}, ref) => {
  const LEFT_EDGE_TRIGGER_BARS = 40;
  const LOAD_MORE_LOCK_TIMEOUT_MS = 7000;
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const indicatorSeriesRefs = useRef<Map<string, ISeriesApi<any>[]>>(new Map()); // Map ID to Array of Series
  const isFetchingRef = useRef(false); // Throttle
  const previousLogicalRangeRef = useRef<{ from: number; to: number } | null>(null); // Avoid initial auto-pagination
  const chartControllerRef = useRef<ChartController | null>(null); // Chart controller for direct updates
  const rawToRenderTimeRef = useRef<Map<number, number>>(new Map());
  const renderToRawTimeRef = useRef<Map<number, number>>(new Map());
  const intervalHintSecRef = useRef<number>(60);
  const lastAppliedDataRef = useRef<{
    symbolKey: string;
    rangeKey: string;
    length: number;
    firstTime: number;
    lastTime: number;
    lastRenderTime: number;
    lastOpen: number;
    lastHigh: number;
    lastLow: number;
    lastClose: number;
  } | null>(null);
  
  // 🔥 FIX: Use ref for onLoadMore to prevent chart remounting when callback changes
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);
  const onHoverCandleChangeRef = useRef(onHoverCandleChange);
  useEffect(() => {
    onHoverCandleChangeRef.current = onHoverCandleChange;
  }, [onHoverCandleChange]);

  // 🔥 ULTRA-PRO OPTIMIZATION: Cached Intl formatters (created once, reused forever)
  // Prevents expensive formatter creation in hot path (tickMarkFormatter runs many times per frame)
  const monthFormatter = useRef(new Intl.DateTimeFormat('en-IN', { month: 'short' }));
  const dayFormatter = useRef(new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }));
  const timeFormatter = useRef(new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }));
  const yearFormatter = useRef(new Intl.DateTimeFormat('en-IN', { year: 'numeric' }));

  // State to force re-render when chart is ready
  const [chartInstance, setChartInstance] = useState<IChartApi | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: height ?? 400 });

  useImperativeHandle(ref, () => ({
    chart: chartRef.current,
    container: chartContainerRef.current
  }));

  // Helper: Detect if pane needed
  const hasMacd = indicators.some(i => i.config.type === 'MACD');

  const toLineData = useCallback(
    (rows: CandlestickData[]) =>
      rows.map((row: any) => ({
        time: row.time,
        value: Number(row.close),
      })),
    []
  );

  const toHeikinAshiData = useCallback((rows: CandlestickData[]): CandlestickData[] => {
    if (!rows.length) return rows;

    const output: CandlestickData[] = [];
    let prevOpen = 0;
    let prevClose = 0;

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index] as any;
      const open = Number(row.open);
      const high = Number(row.high);
      const low = Number(row.low);
      const close = Number(row.close);
      const haClose = (open + high + low + close) / 4;
      const haOpen = index === 0 ? (open + close) / 2 : (prevOpen + prevClose) / 2;
      const haHigh = Math.max(high, haOpen, haClose);
      const haLow = Math.min(low, haOpen, haClose);

      output.push({
        ...row,
        open: haOpen,
        high: haHigh,
        low: haLow,
        close: haClose,
      });

      prevOpen = haOpen;
      prevClose = haClose;
    }

    return output;
  }, []);

  const detectIntervalHintSec = useCallback((rows: CandlestickData[]): number => {
    if (rows.length < 2) return 60;
    const counts = new Map<number, number>();
    let fallback = 60;

    for (let i = 1; i < rows.length; i++) {
      const prev = Number(rows[i - 1]?.time);
      const curr = Number(rows[i]?.time);
      const diff = Math.round(curr - prev);
      if (!Number.isFinite(diff) || diff <= 0) continue;
      if (diff < fallback || fallback <= 0) fallback = diff;
      if (diff > 86_400 * 7) continue;
      counts.set(diff, (counts.get(diff) ?? 0) + 1);
    }

    let best = 0;
    let bestCount = -1;
    for (const [diff, count] of counts.entries()) {
      if (count > bestCount || (count === bestCount && diff < best)) {
        best = diff;
        bestCount = count;
      }
    }

    if (best > 0) return best;
    return fallback > 0 ? fallback : 60;
  }, []);

  const rebuildRenderTimeline = useCallback((rows: CandlestickData[]): CandlestickData[] => {
    rawToRenderTimeRef.current = new Map();
    renderToRawTimeRef.current = new Map();
    if (!rows.length) return rows;

    const intervalHint = detectIntervalHintSec(rows);
    intervalHintSecRef.current = intervalHint;

    const firstRaw = Number(rows[0].time);
    const mapped: CandlestickData[] = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const rawTime = Number(rows[i].time);
      const renderTime = firstRaw + i * intervalHint;
      rawToRenderTimeRef.current.set(rawTime, renderTime);
      renderToRawTimeRef.current.set(renderTime, rawTime);
      mapped[i] = {
        ...rows[i],
        time: renderTime as any,
      };
    }

    return mapped;
  }, [detectIntervalHintSec]);

  const resolveDisplayTime = useCallback((time: number): number => {
    const t = Number(time);
    if (!Number.isFinite(t)) return t;
    return renderToRawTimeRef.current.get(Math.floor(t)) ?? t;
  }, []);

  // 1. Initialize Chart (Mount Only)
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initial Layout
    const width = chartContainerRef.current.clientWidth;
    const initialHeight = chartContainerRef.current.clientHeight || height || 400;
    setDimensions({ width, height: initialHeight });

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(31, 41, 55, 0.5)', style: 2 }, // Dashed
        horzLines: { color: 'rgba(31, 41, 55, 0.5)', style: 2 },
      },
      width: width,
      height: initialHeight,
      timeScale: {
        borderColor: '#1F2937',
        timeVisible: true,
        secondsVisible: false,
        rightBarStaysOnScroll: true,
        lockVisibleTimeRangeOnResize: true,
        ignoreWhitespaceIndices: true,
        rightOffset: 12,
        // 🔥 INSTITUTIONAL-GRADE TICK MARK FORMATTER
        // Uses tick weight (not timeframe) for automatic zoom adaptation
        // Matches TradingView/Bloomberg professional behavior
        tickMarkFormatter: (time: number, tickMarkType: number) => {
          const date = new Date(resolveDisplayTime(time) * 1000);
          
          // 🔥 Tick weight-based formatting (professional approach)
          // tickMarkType: 0=year, 1=month, 2=day, 3=hour, 4=minute
          switch (tickMarkType) {
            case 0: // Year boundary
              return yearFormatter.current.format(date);
            
            case 1: // Month boundary
              return monthFormatter.current.format(date);
            
            case 2: // Day boundary
              return dayFormatter.current.format(date);
            
            case 3: // Hour boundary
            case 4: // Minute boundary
              return timeFormatter.current.format(date);
            
            default:
              return dayFormatter.current.format(date);
          }
        },
      },
      rightPriceScale: {
        borderColor: '#1F2937',
        visible: true,
        autoScale: true,
      },
      localization: {
        timeFormatter: (time: number) => {
          const date = new Date(resolveDisplayTime(time) * 1000);
          
          // 🔥 SMART FORMATTING: Detect if this is a daily/weekly/monthly candle
          // Daily+ candles have time = 00:00 in IST, intraday candles have actual times
          const timeStr = date.toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
          const isDailyOrHigher = timeStr === '00:00';
          
          if (isDailyOrHigher) {
            // Daily/Weekly/Monthly candles → Show date only
            return date.toLocaleDateString('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            });
          } else {
            // Intraday candles → Show date + time
            return date.toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
          }
        },
      },
      crosshair: { mode: CrosshairMode.Normal }
    });

    // 1. Candlestick Series (uses default 'right' price scale)
    const candlestickSeriesInstance = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#F23645',
      borderUpColor: '#089981',
      borderDownColor: '#F23645',
      wickUpColor: '#089981',
      wickDownColor: '#F23645',
    });

    const lineSeriesInstance = chart.addSeries(LineSeries, {
      color: "#60A5FA",
      lineWidth: 2,
      visible: false,
      priceScaleId: "right",
      lastValueVisible: true,
      priceLineVisible: false,
    });

    const areaSeriesInstance = chart.addSeries(AreaSeries, {
      lineColor: "#38BDF8",
      topColor: "rgba(56, 189, 248, 0.35)",
      bottomColor: "rgba(56, 189, 248, 0.02)",
      lineWidth: 2,
      visible: false,
      priceScaleId: "right",
      lastValueVisible: true,
      priceLineVisible: false,
    });

    // Configure candlestick scale margins (top 70% of chart)
    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.05,   // 5% from top
        bottom: 0.30, // Leave 30% for volume (increased gap)
      },
    });

    // 2. Volume Series (SEPARATE price scale for true separation)
    const volumeSeriesInstance = chart.addSeries(HistogramSeries, {
      color: '#334155', // Dark gray (darker for dark mode)
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume', // ✅ Separate scale - NOT overlayed
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Configure volume scale margins (bottom 18% of chart)
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.82,    // Start at 82% down (increased gap)
        bottom: 0.02, // 2% from bottom
      },
    });

    const handleCrosshairMove = (param: any) => {
      const callback = onHoverCandleChangeRef.current;
      if (!callback) return;
      const row = param?.seriesData?.get?.(candlestickSeriesInstance) as any;
      if (!row) {
        callback(null);
        return;
      }
      const renderTime = Number(row.time);
      callback({
        time: resolveDisplayTime(renderTime) as any,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
      });
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    // Infinite Scroll Monitor
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (!range) return;

        const currentRange = {
          from: Number(range.from),
          to: Number(range.to),
        };

        const previousRange = previousLogicalRangeRef.current;
        previousLogicalRangeRef.current = currentRange;

        // Skip first range event fired during initial chart/data setup.
        if (!previousRange) return;

        // Only fetch more when user actually scrolls LEFT near the boundary.
        const movedLeft = currentRange.from < previousRange.from;
        const nearLeftEdge = currentRange.from < LEFT_EDGE_TRIGGER_BARS;
        if (!movedLeft || !nearLeftEdge || isFetchingRef.current) return;

        const loadMore = onLoadMoreRef.current;
        if (loadMore) {
            isFetchingRef.current = true;
            let released = false;
            const releaseLock = () => {
                if (released) return;
                released = true;
                isFetchingRef.current = false;
            };

            const lockTimeout = setTimeout(() => {
                console.warn(`Infinite scroll lock timeout (${LOAD_MORE_LOCK_TIMEOUT_MS}ms). Releasing lock.`);
                releaseLock();
            }, LOAD_MORE_LOCK_TIMEOUT_MS);

            try {
                Promise.resolve(loadMore())
                    .catch((error) => {
                        console.error('Infinite scroll load-more failed:', error);
                        trackAnalysisEvent({
                          name: "chart_load_more_failed",
                          level: "warn",
                          payload: {
                            symbol,
                            instrumentKey,
                          },
                        });
                    })
                    .finally(() => {
                        clearTimeout(lockTimeout);
                        releaseLock();
                    });
            } catch (error) {
                clearTimeout(lockTimeout);
                releaseLock();
                console.error('Infinite scroll load-more threw synchronously:', error);
                trackAnalysisEvent({
                  name: "chart_load_more_failed_sync",
                  level: "warn",
                  payload: {
                    symbol,
                    instrumentKey,
                  },
                });
            }
        } else {
            console.warn('Infinite scroll triggered but no onLoadMore callback');
        }
    });

    chartRef.current = chart;
    candleSeriesRef.current = candlestickSeriesInstance;
    lineSeriesRef.current = lineSeriesInstance;
    areaSeriesRef.current = areaSeriesInstance;
    volumeSeriesRef.current = volumeSeriesInstance; // ✅ Store ref
    setChartInstance(chart); // Trigger re-render to mount DrawingManager
    
    if (onChartReady) {
        onChartReady(chart);
    }

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
    };
  }, [resolveDisplayTime]); // 🔥 CRITICAL FIX: Empty deps - chart only mounts once!
  // onLoadMore changes are handled via ref, not by remounting the entire chart

  // ═══════════════════════════════════════════════════════════
  // 🛠️ CHART CONTROLLER INTEGRATION: Direct updates via RAF batching
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!candleSeriesRef.current || !symbol) return;
    const registrySymbol = toCanonicalSymbol(symbol);
    const registryInstrumentKey = toInstrumentKey(instrumentKey || registrySymbol);
    rawToRenderTimeRef.current = new Map();
    renderToRawTimeRef.current = new Map();
    intervalHintSecRef.current = 60;
    lastAppliedDataRef.current = null;

    // Create instance-based controller for this chart
    const controller = new ChartController(`chart-${registryInstrumentKey}`);
    controller.setSeries(candleSeriesRef.current);
    chartControllerRef.current = controller;

    // ═══════════════════════════════════════════════════════════
    // 🛠️ REGISTER WITH CHART REGISTRY (STEP 5 - Single Writer)
    // ═══════════════════════════════════════════════════════════
    // This enables CandleEngine → ChartRegistry → ChartController
    // Direct updates bypass React/Zustand entirely
    chartRegistry.register(registryInstrumentKey, controller);
    // Cleanup
    return () => {
      chartRegistry.unregister(registryInstrumentKey);
      controller.destroy();
      chartControllerRef.current = null;
    };
  }, [symbol, instrumentKey]); // 🔥 CRITICAL FIX: Only depend on symbol identity, NOT data!
  // Controller mounts once per symbol, never rebuilds
  
  // ═══════════════════════════════════════════════════════════
  // 🔥 SEPARATE EFFECT: Handle data updates without remounting
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const controller = chartControllerRef.current;
    
    // RACE CONDITION FIX: Ensure controller exists and has valid series
    // When switching stocks, old controller might be destroyed while new data arrives
    if (!controller || !data || data.length === 0) {
        return;
    }
    
    // Double-check the controller still has a valid series (not destroyed)
    const stats = controller.getStats();
    if (!stats.hasSeries) {
        console.warn(`Skipping data update - controller series not ready for ${symbol}`);
        return;
    }

    const symbolKey = toInstrumentKey(instrumentKey || symbol);
    const rangeKey = String(range || '').toUpperCase();
    const firstTime = Number(data[0]?.time);
    const lastCandle = data[data.length - 1] as CandlestickData;
    const lastTime = Number(lastCandle?.time);
    const lastOpen = Number((lastCandle as any)?.open);
    const lastHigh = Number((lastCandle as any)?.high);
    const lastLow = Number((lastCandle as any)?.low);
    const lastClose = Number((lastCandle as any)?.close);

    const prev = lastAppliedDataRef.current;
    const symbolOrRangeChanged = !prev || prev.symbolKey !== symbolKey || prev.rangeKey !== rangeKey;
    const sameLeadingEdge = !!prev && firstTime === prev.firstTime;
    const appendedNewestOnly =
      !!prev &&
      !symbolOrRangeChanged &&
      sameLeadingEdge &&
      data.length === prev.length + 1 &&
      lastTime > prev.lastTime;
    const patchedNewestOnly =
      !!prev &&
      !symbolOrRangeChanged &&
      sameLeadingEdge &&
      data.length === prev.length &&
      lastTime === prev.lastTime &&
      (lastOpen !== prev.lastOpen ||
        lastHigh !== prev.lastHigh ||
        lastLow !== prev.lastLow ||
        lastClose !== prev.lastClose);
    const unchangedData =
      !!prev &&
      !symbolOrRangeChanged &&
      sameLeadingEdge &&
      data.length === prev.length &&
      lastTime === prev.lastTime &&
      lastOpen === prev.lastOpen &&
      lastHigh === prev.lastHigh &&
      lastLow === prev.lastLow &&
      lastClose === prev.lastClose;

    const allowIncrementalCandleWrite = chartStyle !== "HEIKIN_ASHI";

    if (allowIncrementalCandleWrite && (appendedNewestOnly || patchedNewestOnly) && lastCandle) {
      let renderTime = rawToRenderTimeRef.current.get(lastTime);
      if (!Number.isFinite(renderTime as number) && appendedNewestOnly && prev) {
        renderTime = prev.lastRenderTime + intervalHintSecRef.current;
        rawToRenderTimeRef.current.set(lastTime, renderTime as number);
        renderToRawTimeRef.current.set(renderTime as number, lastTime);
      }
      if (!Number.isFinite(renderTime as number)) {
        renderTime = lastTime;
      }

      const renderCandle: CandlestickData = {
        ...(lastCandle as any),
        time: Number(renderTime) as any,
      };
      controller.updateCandle(renderCandle);
      if (lineSeriesRef.current) {
        lineSeriesRef.current.update({
          time: renderCandle.time as any,
          value: Number(renderCandle.close),
        } as any);
      }
      if (areaSeriesRef.current) {
        areaSeriesRef.current.update({
          time: renderCandle.time as any,
          value: Number(renderCandle.close),
        } as any);
      }
      lastAppliedDataRef.current = {
        symbolKey,
        rangeKey,
        length: data.length,
        firstTime,
        lastTime,
        lastRenderTime: Number(renderTime),
        lastOpen,
        lastHigh,
        lastLow,
        lastClose,
      };
      return;
    }

    if (unchangedData) {
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      for (let i = 1; i < data.length; i++) {
        if (data[i].time <= data[i - 1].time) {
          console.error('Non-monotonic candle stream detected', {
            index: i,
            prev: data[i - 1],
            current: data[i],
          });
          trackAnalysisEvent({
            name: "chart_non_monotonic_candles",
            level: "warn",
            payload: {
              symbol,
              instrumentKey,
              index: i,
            },
          });
          break;
        }
      }
    }
    
    // Full reset path: symbol/range changes and non-tail structural history changes.
    const renderedData = rebuildRenderTimeline(data as CandlestickData[]);
    const baseForPrimary = chartStyle === "HEIKIN_ASHI" ? toHeikinAshiData(renderedData) : renderedData;
    controller.setData(baseForPrimary);
    const lineData = toLineData(renderedData);
    if (lineSeriesRef.current) {
      lineSeriesRef.current.setData(lineData as any);
    }
    if (areaSeriesRef.current) {
      areaSeriesRef.current.setData(lineData as any);
    }
    const renderedLastTime = Number(renderedData[renderedData.length - 1]?.time ?? lastTime);
    lastAppliedDataRef.current = {
      symbolKey,
      rangeKey,
      length: data.length,
      firstTime,
      lastTime,
      lastRenderTime: renderedLastTime,
      lastOpen,
      lastHigh,
      lastLow,
      lastClose,
    };
  }, [data, symbol, instrumentKey, range, chartStyle, toHeikinAshiData, toLineData]); // Listen to data changes, update via controller

  // Handle Volume Updates
  useEffect(() => {
    // 🛡️ RACE CONDITION FIX: Store local reference to prevent null during stock switch
    const volumeSeries = volumeSeriesRef.current;
    
    if (volumeSeries && volumeData && volumeData.length > 0) {
        try {
            const mappedVolume = volumeData.map((row: any) => {
              const rawTime = Number(row?.time);
              const mappedTime = rawToRenderTimeRef.current.get(rawTime);
              if (!Number.isFinite(mappedTime as number)) {
                return row;
              }
              return {
                ...row,
                time: Number(mappedTime) as any,
              };
            });
            volumeSeries.setData(mappedVolume as any);
        } catch (error) {
            console.warn(`⚠️ Failed to update volume data:`, error);
            trackAnalysisEvent({
              name: "chart_volume_update_failed",
              level: "warn",
              payload: {
                symbol,
                instrumentKey,
              },
            });
        }
    }
  }, [volumeData]);

  // 1.5 Handle Resize with ResizeObserver
  useEffect(() => {
    if (!autoResize || !chartContainerRef.current || !chartRef.current) return;

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      
      chartRef.current?.applyOptions({ width, height });
      setDimensions({ width, height });
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => resizeObserver.disconnect();
  }, [autoResize, chartInstance]);

  // 2. Handle Height Updates Efficiently
  useEffect(() => {
    // If height prop is provided explicitly, override
    if (typeof height === "number" && height > 0 && chartRef.current) {
       chartRef.current.applyOptions({ height });
       setDimensions(d => ({ ...d, height }));
    }
  }, [height]);


  // 2. Data Loading - REMOVED
  // ChartController loads data directly on creation (see above)
  // This prevents React from touching the chart after initial load


  // 3. Dynamic Pane Layout
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    const bottomWithVolume = showVolume ? 0.30 : 0.05;
    if (hasMacd) {
      // Shrink Main Candle Series
      candleSeriesRef.current.priceScale().applyOptions({
        scaleMargins: { top: 0.05, bottom: bottomWithVolume }
      });
    } else {
      // Full height
      candleSeriesRef.current.priceScale().applyOptions({
        scaleMargins: { top: 0.05, bottom: showVolume ? 0.30 : 0.05 }
      });
    }
  }, [hasMacd, showVolume]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const lineSeries = lineSeriesRef.current;
    const areaSeries = areaSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !lineSeries || !areaSeries) return;

    const isCandleMode = chartStyle === "CANDLE" || chartStyle === "HEIKIN_ASHI";
    candleSeries.applyOptions({
      visible: isCandleMode,
      upColor: chartStyle === "HEIKIN_ASHI" ? "#22C55E" : "#089981",
      downColor: chartStyle === "HEIKIN_ASHI" ? "#EF4444" : "#F23645",
      borderUpColor: chartStyle === "HEIKIN_ASHI" ? "#22C55E" : "#089981",
      borderDownColor: chartStyle === "HEIKIN_ASHI" ? "#EF4444" : "#F23645",
      wickUpColor: chartStyle === "HEIKIN_ASHI" ? "#22C55E" : "#089981",
      wickDownColor: chartStyle === "HEIKIN_ASHI" ? "#EF4444" : "#F23645",
    });

    lineSeries.applyOptions({
      visible: chartStyle === "LINE",
    });

    areaSeries.applyOptions({
      visible: chartStyle === "AREA",
    });

    if (volumeSeries) {
      volumeSeries.applyOptions({
        visible: showVolume,
      });
    }
  }, [chartStyle, showVolume]);


  // 4. Update Indicators
  useEffect(() => {
    if (!chartRef.current) return;

    const currentIds = new Set(indicators.map(i => i.config.id));

    // Remove old
    indicatorSeriesRefs.current.forEach((seriesArray, id) => {
      if (!currentIds.has(id)) {
        seriesArray.forEach(s => chartRef.current?.removeSeries(s));
        indicatorSeriesRefs.current.delete(id);
      }
    });

    // Add/Update new
    indicators.forEach(({ config, data, series }) => {
      const existing = indicatorSeriesRefs.current.get(config.id);

      if (config.type === 'MACD' && series) {
        if (!existing) {
          // Create 3 series
          // Common PriceScaleId for synchronization
          const paneId = 'MACD';

          // 1. Histogram
          const hist = chartRef.current!.addSeries(HistogramSeries, {
            priceScaleId: paneId,
            color: config.seriesColors?.histogram || '#26a69a'
          });

          // 2. MACD
          const macdLine = chartRef.current!.addSeries(LineSeries, {
            priceScaleId: paneId,
            color: config.seriesColors?.macd || '#2962FF',
            lineWidth: 1,
            title: 'MACD'
          });

          // 3. Signal
          const sigLine = chartRef.current!.addSeries(LineSeries, {
            priceScaleId: paneId,
            color: config.seriesColors?.signal || '#FF6D00',
            lineWidth: 1,
            title: 'Signal'
          });

          // Configure Scale for Pane
          chartRef.current!.priceScale(paneId).applyOptions({
            scaleMargins: { top: 0.75, bottom: 0 }, // Bottom 25%
          });

          indicatorSeriesRefs.current.set(config.id, [hist, macdLine, sigLine]);

          // Initial Data
          hist.setData(series.histogram || []);
          macdLine.setData(series.macd || []);
          sigLine.setData(series.signal || []);

        } else {
          // Update Data
          const [hist, macdLine, sigLine] = existing;
          hist.setData(series.histogram || []);
          macdLine.setData(series.macd || []);
          sigLine.setData(series.signal || []);
        }
      }
      else if (config.type === 'BB' && series) {
        if (!existing) {
          // Create 3 lines
          // Common PriceScaleId = right (overlay on main chart)
          const upper = chartRef.current!.addSeries(LineSeries, {
            color: config.display.color || '#2962FF',
            lineWidth: 1,
            title: 'BB Upper'
          });
          const lower = chartRef.current!.addSeries(LineSeries, {
            color: config.display.color || '#2962FF',
            lineWidth: 1,
            title: 'BB Lower'
          });
          const middle = chartRef.current!.addSeries(LineSeries, {
            color: '#FF6D00', // Orange for middle
            lineWidth: 1,
            title: 'BB Middle'
          });

          indicatorSeriesRefs.current.set(config.id, [upper, lower, middle]);

          if (series.upper) upper.setData(series.upper || []);
          if (series.lower) lower.setData(series.lower || []);
          if (series.middle) middle.setData(series.middle || []);
        } else {
          const [upper, lower, middle] = existing;
          if (series.upper) upper.setData(series.upper || []);
          if (series.lower) lower.setData(series.lower || []);
          if (series.middle) middle.setData(series.middle || []);
        }
      }
      else {
        // Simple Indicators (SMA/RSI/EMA)
        if (!existing) {
          // ... same as before
          const s = chartRef.current!.addSeries(LineSeries, {
            color: config.display.color,
            lineWidth: Math.max(1, Math.min(4, Number(config.display.lineWidth || 2))) as any,
            priceScaleId: config.type === 'RSI' ? 'RSI' : 'right',
            title: `${config.type} ${config.params?.period || ""}`.trim()
          });

          if (config.type === 'RSI') {
            chartRef.current!.priceScale('RSI').applyOptions({
              scaleMargins: { top: 0.8, bottom: 0.05 }
            });
            // And main chart needs to shrink? NO, usually overlay or resize.
            // For now overlay is fine or just separate scale.
          }

          indicatorSeriesRefs.current.set(config.id, [s]);
          s.setData(data);
        } else {
          existing[0].setData(data);
        }
      }
    });

  }, [indicators]);

  return (
    <div ref={chartContainerRef} className="w-full h-full rounded-lg relative">
      {chartInstance && candleSeriesRef.current && dimensions.width > 0 && data && data.length > 0 && (
        <DrawingManager
          chart={chartInstance}
          mainSeries={candleSeriesRef.current}
          width={dimensions.width}
          height={dimensions.height}
          data={data}
          symbol={symbol} 
        />
      )}
    </div>
  );
});

BaseChart.displayName = 'BaseChart';


