"use client";
import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, CandlestickData, HistogramSeries, HistogramData, CrosshairMode, LineSeries } from 'lightweight-charts';
import { IndicatorConfig } from '@/stores/trading/analysis.store';
import { DrawingManager } from './overlays/DrawingManager';
import { ChartController } from '@/lib/trading/chart-controller';
import { chartRegistry } from '@/lib/trading/chart-registry';
import { toCanonicalSymbol, toInstrumentKey } from '@/lib/market/symbol-normalization';

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
  range?: string; // ✅ Add range prop for dynamic formatting
  onChartReady?: (api: IChartApi) => void;
  onLoadMore?: () => Promise<void> | void; // ✅ Async-capable for robust lock release
}

export interface BaseChartRef {
  chart: IChartApi | null;
  container: HTMLDivElement | null;
}

export const BaseChart = forwardRef<BaseChartRef, BaseChartProps>(({
  data,
  volumeData,
  indicators = [],
  height = 400,
  autoResize = true,
  symbol,
  instrumentKey,
  range, // ✅ Extract range prop
  onChartReady,
  onLoadMore 
}, ref) => {
  const LEFT_EDGE_TRIGGER_BARS = 40;
  const LOAD_MORE_LOCK_TIMEOUT_MS = 7000;
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const indicatorSeriesRefs = useRef<Map<string, ISeriesApi<any>[]>>(new Map()); // Map ID to Array of Series
  const isFetchingRef = useRef(false); // Throttle
  const previousLogicalRangeRef = useRef<{ from: number; to: number } | null>(null); // Avoid initial auto-pagination
  const chartControllerRef = useRef<ChartController | null>(null); // Chart controller for direct updates
  
  // 🔥 FIX: Use ref for onLoadMore to prevent chart remounting when callback changes
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  // 🔥 ULTRA-PRO OPTIMIZATION: Cached Intl formatters (created once, reused forever)
  // Prevents expensive formatter creation in hot path (tickMarkFormatter runs many times per frame)
  const monthFormatter = useRef(new Intl.DateTimeFormat('en-IN', { month: 'short' }));
  const dayFormatter = useRef(new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }));
  const timeFormatter = useRef(new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }));
  const yearFormatter = useRef(new Intl.DateTimeFormat('en-IN', { year: 'numeric' }));

  // State to force re-render when chart is ready
  const [chartInstance, setChartInstance] = useState<IChartApi | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 400 });

  useImperativeHandle(ref, () => ({
    chart: chartRef.current,
    container: chartContainerRef.current
  }));

  // Helper: Detect if pane needed
  const hasMacd = indicators.some(i => i.config.type === 'MACD');

  // 1. Initialize Chart (Mount Only)
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initial Layout
    const width = chartContainerRef.current.clientWidth;
    const initialHeight = chartContainerRef.current.clientHeight || height;
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
        rightOffset: 12,
        // 🔥 INSTITUTIONAL-GRADE TICK MARK FORMATTER
        // Uses tick weight (not timeframe) for automatic zoom adaptation
        // Matches TradingView/Bloomberg professional behavior
        tickMarkFormatter: (time: number, tickMarkType: number) => {
          const date = new Date(time * 1000);
          
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
          const date = new Date(time * 1000);
          
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

    // Infinite Scroll Monitor
    console.log('📊 Setting up infinite scroll listener');
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
                    })
                    .finally(() => {
                        clearTimeout(lockTimeout);
                        releaseLock();
                    });
            } catch (error) {
                clearTimeout(lockTimeout);
                releaseLock();
                console.error('Infinite scroll load-more threw synchronously:', error);
            }
        } else {
            console.warn('Infinite scroll triggered but no onLoadMore callback');
        }
    });

    chartRef.current = chart;
    candleSeriesRef.current = candlestickSeriesInstance;
    volumeSeriesRef.current = volumeSeriesInstance; // ✅ Store ref
    setChartInstance(chart); // Trigger re-render to mount DrawingManager
    
    if (onChartReady) {
        onChartReady(chart);
    }

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []); // 🔥 CRITICAL FIX: Empty deps - chart only mounts once!
  // onLoadMore changes are handled via ref, not by remounting the entire chart

  // ═══════════════════════════════════════════════════════════
  // 🛠️ CHART CONTROLLER INTEGRATION: Direct updates via RAF batching
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!candleSeriesRef.current || !symbol) return;
    const registrySymbol = toCanonicalSymbol(symbol);
    const registryInstrumentKey = toInstrumentKey(instrumentKey || registrySymbol);

    console.log(`🎨 Initializing ChartController for ${registryInstrumentKey}`);
    
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
    console.log(`✅ ChartController registered in registry for ${registryInstrumentKey}`);


    console.log(`✅ ChartController initialized and registered for ${registryInstrumentKey}`);

    // Cleanup
    return () => {
      console.log(`🗑️ ChartController cleanup starting for ${registryInstrumentKey}`);
      chartRegistry.unregister(registryInstrumentKey);
      controller.destroy();
      chartControllerRef.current = null;
      console.log(`🗑️ ChartController destroyed for ${registryInstrumentKey}`);
    };
  }, [symbol, instrumentKey]); // 🔥 CRITICAL FIX: Only depend on symbol identity, NOT data!
  // Controller mounts once per symbol, never rebuilds
  
  // ═══════════════════════════════════════════════════════════
  // 🔥 SEPARATE EFFECT: Handle data updates without remounting
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const controller = chartControllerRef.current;
    
    console.log(`📊 Data update effect triggered: data.length=${data?.length || 0}, symbol=${symbol}`);
    
    // 🛡️ RACE CONDITION FIX: Ensure controller exists and has valid series
    // When switching stocks, old controller might be destroyed while new data arrives
    if (!controller || !data || data.length === 0) {
        console.log(`⏸️ Skipping data update: controller=${!!controller}, data.length=${data?.length || 0}`);
        return;
    }
    
    // Double-check the controller still has a valid series (not destroyed)
    const stats = controller.getStats();
    if (!stats.hasSeries) {
        console.warn(`⚠️ Skipping data update - controller series not ready for ${symbol}`);
        return;
    }
    
    // Update chart data via controller (no remount!)
    console.log(`📊 Updating ChartController with ${data.length} candles for ${symbol}`);
    controller.setData(data);
    console.log(`✅ Chart data updated successfully: ${data.length} candles for ${symbol}`);
  }, [data, symbol]); // Listen to data changes, update via controller

  // Handle Volume Updates
  useEffect(() => {
    // 🛡️ RACE CONDITION FIX: Store local reference to prevent null during stock switch
    const volumeSeries = volumeSeriesRef.current;
    
    if (volumeSeries && volumeData && volumeData.length > 0) {
        try {
            volumeSeries.setData(volumeData);
        } catch (error) {
            console.warn(`⚠️ Failed to update volume data:`, error);
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
    if (height && chartRef.current) {
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

    if (hasMacd) {
      // Shrink Main Candle Series
      candleSeriesRef.current.priceScale().applyOptions({
        scaleMargins: { top: 0.05, bottom: 0.30 }
      });
    } else {
      // Full height
      candleSeriesRef.current.priceScale().applyOptions({
        scaleMargins: { top: 0.05, bottom: 0.05 }
      });
    }
  }, [hasMacd]);


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
            color: '#26a69a'
          });

          // 2. MACD
          const macdLine = chartRef.current!.addSeries(LineSeries, {
            priceScaleId: paneId,
            color: '#2962FF',
            lineWidth: 1,
            title: 'MACD'
          });

          // 3. Signal
          const sigLine = chartRef.current!.addSeries(LineSeries, {
            priceScaleId: paneId,
            color: '#FF6D00',
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
            color: '#2962FF',
            lineWidth: 1,
            title: 'BB Upper'
          });
          const lower = chartRef.current!.addSeries(LineSeries, {
            color: '#2962FF',
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
            color: config.color,
            lineWidth: 2,
            priceScaleId: config.type === 'RSI' ? 'RSI' : 'right',
            title: `${config.type} ${config.period || 14}`
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
