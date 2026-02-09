"use client";
import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, CandlestickData, HistogramSeries, HistogramData, CrosshairMode, LineSeries } from 'lightweight-charts';
import { IndicatorConfig } from '@/stores/trading/analysis.store';
import { DrawingManager } from './overlays/DrawingManager';
import { ChartController } from '@/lib/trading/chart-controller';
import { chartRegistry } from '@/lib/trading/chart-registry';

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
  range?: string; // ✅ Add range prop for dynamic formatting
  onChartReady?: (api: IChartApi) => void;
  onLoadMore?: () => void; // ✅ New Prop
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
  range, // ✅ Extract range prop
  onChartReady,
  onLoadMore 
}, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const indicatorSeriesRefs = useRef<Map<string, ISeriesApi<any>[]>>(new Map()); // Map ID to Array of Series
  const isFetchingRef = useRef(false); // Throttle
  const chartControllerRef = useRef<ChartController | null>(null); // Chart controller for direct updates
  
  // 🔥 FIX: Use ref for onLoadMore to prevent chart remounting when callback changes
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

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
        rightOffset: 12, // ✅ Add space on right
        // ✅ Dynamic tick formatter based on range
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          const currentRange = range?.toUpperCase() || '1D';
          
          // ✅ Professional X-Axis Formatting
          // Intraday (1D, 5D) → Show time only
          if (currentRange === '1D' || currentRange === '5D') {
            return date.toLocaleTimeString('en-IN', { 
              timeZone: 'Asia/Kolkata', 
              hour12: false, 
              hour: '2-digit', 
              minute: '2-digit' 
            });
          }
          
          // Mid-range (1M) → Show date
          if (currentRange === '1M') {
            return date.toLocaleDateString('en-IN', { 
              timeZone: 'Asia/Kolkata', 
              day: 'numeric', 
              month: 'short' 
            });
          }
          
          // 6M range → Show month + year
          if (currentRange === '6M') {
            return date.toLocaleDateString('en-IN', { 
              timeZone: 'Asia/Kolkata', 
              month: 'short',
              year: 'numeric'
            });
          }
          
          // 1Y range → Show quarterly (every 3 months)
          if (currentRange === '1Y') {
            const month = date.getMonth();
            // Show Jan, Apr, Jul, Oct only (quarterly)
            if (month === 0 || month === 3 || month === 6 || month === 9) {
              return date.toLocaleDateString('en-IN', { 
                timeZone: 'Asia/Kolkata', 
                month: 'short',
                year: 'numeric'
              });
            }
            return ''; // Hide other months
          }
          
          // 5Y range → Show yearly (January only)
          if (currentRange === '5Y') {
            const month = date.getMonth();
            // Show only January of each year
            if (month === 0) {
              return date.toLocaleDateString('en-IN', { 
                timeZone: 'Asia/Kolkata', 
                year: 'numeric'
              });
            }
            return ''; // Hide other months
          }
          
          // Default fallback
          return date.toLocaleDateString('en-IN', { 
            timeZone: 'Asia/Kolkata', 
            day: 'numeric', 
            month: 'short' 
          });
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
          return date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
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

    // Configure candlestick scale margins (top 75% of chart)
    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.05,   // 5% from top
        bottom: 0.25, // Leave 25% for volume
      },
    });

    // 2. Volume Series (SEPARATE price scale for true separation)
    const volumeSeriesInstance = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume', // ✅ Separate scale - NOT overlayed
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Configure volume scale margins (bottom 20% of chart)
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8,    // Start at 80% down
        bottom: 0.02, // 2% from bottom
      },
    });

    // Infinite Scroll Monitor
    console.log('📊 Setting up infinite scroll listener');
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        // 🔥 Trigger when user scrolls near left edge (matching old working version)
        if (range && range.from < 10 && !isFetchingRef.current) {
             console.log(`📊 Infinite scroll triggered: range.from=${range.from}, isFetching=${isFetchingRef.current}`);
             // 🔥 FIX: Use ref instead of direct callback to prevent chart remounting
             if (onLoadMoreRef.current) {
                 // Throttle locally to prevent spam
                 isFetchingRef.current = true;
                 console.log('📊 Calling onLoadMore callback...');
                 onLoadMoreRef.current();
                 // 2s cooldown (matching old working version)
                 setTimeout(() => {
                     isFetchingRef.current = false;
                     console.log('📊 Infinite scroll cooldown complete');
                 }, 2000);
             } else {
                 console.warn('⚠️ Infinite scroll triggered but no onLoadMore callback');
             }
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

    console.log(`🎨 Initializing ChartController for ${symbol}`);
    
    // Create instance-based controller for this chart
    const controller = new ChartController(`chart-${symbol}`);
    controller.setSeries(candleSeriesRef.current);
    chartControllerRef.current = controller;

    // ═══════════════════════════════════════════════════════════
    // 🛠️ REGISTER WITH CHART REGISTRY (STEP 5 - Single Writer)
    // ═══════════════════════════════════════════════════════════
    // This enables CandleEngine → ChartRegistry → ChartController
    // Direct updates bypass React/Zustand entirely
    chartRegistry.register(symbol, controller);
    console.log(`✅ ChartController registered in registry for ${symbol}`);

    // ═══════════════════════════════════════════════════════════
    // 🔥 ELITE PATTERN: Load data DIRECTLY into controller
    // ═══════════════════════════════════════════════════════════
    // Do NOT wait for React/Zustand - inject immediately
    if (data && data.length > 0) {
      console.log(`🔥 ChartController: Loading ${data.length} candles directly on init`);
      controller.setData(data);
    } else {
      console.log(`⏸️ ChartController: No initial data to load (data.length=${data?.length || 0})`);
    }

    console.log(`✅ ChartController initialized and registered for ${symbol}`);

    // Cleanup
    return () => {
      console.log(`🗑️ ChartController cleanup starting for ${symbol}`);
      chartRegistry.unregister(symbol);
      controller.destroy();
      chartControllerRef.current = null;
      console.log(`🗑️ ChartController destroyed for ${symbol}`);
    };
  }, [symbol]); // 🔥 CRITICAL FIX: Only depend on symbol, NOT data!
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
