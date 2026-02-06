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
        // Configure timezone to IST (UTC+5:30)
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          // Efficiently check for midnight in IST
          const timeStr = date.toLocaleTimeString('en-IN', { 
            timeZone: 'Asia/Kolkata', 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          
          // If midnight (Daily/Weekly candles) OR 24:00 edge case -> Show Date
          if (timeStr === '00:00' || timeStr === '24:00') {
              return date.toLocaleDateString('en-IN', { 
                timeZone: 'Asia/Kolkata', 
                day: 'numeric', 
                month: 'short' 
              });
          }
          // Intraday -> Show Time
          return timeStr;
        },
      },
      rightPriceScale: {
        borderColor: '#1F2937',
        visible: true,
        autoScale: true, // ✅ Ensure auto-scaling
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

    // 1. Candlestick Series
    const candlestickSeriesInstance = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',   // ✅ Matte Green
      downColor: '#F23645', // ✅ Matte Red
      borderUpColor: '#089981',
      borderDownColor: '#F23645',
      wickUpColor: '#089981',
      wickDownColor: '#F23645',
    });

    // Set candlestick scale margins (top 75% of chart)
    candlestickSeriesInstance.priceScale().applyOptions({
      scaleMargins: {
        top: 0.05,    // 5% padding from top
        bottom: 0.25, // Leave 25% for volume + gap
      },
    });

    // 2. Volume Series (Overlay)
    const volumeSeriesInstance = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '', // Overlay on same scale (but we use margins to separate)
    });
    
    // Position Volume at bottom 20%
    volumeSeriesInstance.priceScale().applyOptions({
      scaleMargins: {
        top: 0.80, // Start at 80% down (5% gap from candles)
        bottom: 0,
      },
    });

    // Infinite Scroll Monitor
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        // 🔥 Prefetch earlier for seamless UX (no loading indicators visible)
        if (range && range.from < 40 && !isFetchingRef.current) {
             if (onLoadMore) {
                 // Throttle locally to prevent spam
                 isFetchingRef.current = true;
                 onLoadMore();
                 // 3s cooldown to prevent rapid requests
                 setTimeout(() => isFetchingRef.current = false, 3000);
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
  }, []); // 🔥 CRITICAL: Empty deps = mount once, never recreate
  // height/callbacks are stable enough, don't remount chart for them

  // ═══════════════════════════════════════════════════════════
  // 🛠️ CHART CONTROLLER INTEGRATION: Direct updates via RAF batching
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!candleSeriesRef.current || !symbol) return;

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

    // ═══════════════════════════════════════════════════════════
    // 🔥 ELITE PATTERN: Load data DIRECTLY into controller
    // ═══════════════════════════════════════════════════════════
    // Do NOT wait for React/Zustand - inject immediately
    if (data && data.length > 0) {
      controller.setData(data);
      console.log(`🔥 ChartController: Loaded ${data.length} candles directly`);
    }

    console.log(`✅ ChartController initialized and registered for ${symbol}`);

    // Cleanup
    return () => {
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
    
    // 🛡️ RACE CONDITION FIX: Ensure controller exists and has valid series
    // When switching stocks, old controller might be destroyed while new data arrives
    if (!controller || !data || data.length === 0) return;
    
    // Double-check the controller still has a valid series (not destroyed)
    const stats = controller.getStats();
    if (!stats.hasSeries) {
        console.warn(`⚠️ Skipping data update - controller series not ready for ${symbol}`);
        return;
    }
    
    // Update chart data via controller (no remount!)
    controller.setData(data);
    console.log(`📊 Chart data updated: ${data.length} candles for ${symbol}`);
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
