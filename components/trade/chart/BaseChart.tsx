"use client";
import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, CandlestickData, HistogramSeries, HistogramData, CrosshairMode, LineSeries } from 'lightweight-charts';
import { IndicatorConfig } from '@/stores/trading/analysis.store';
import { DrawingManager } from './overlays/DrawingManager';

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
}, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const indicatorSeriesRefs = useRef<Map<string, ISeriesApi<any>[]>>(new Map()); // Map ID to Array of Series

  // State to force re-render when chart is ready
  const [chartInstance, setChartInstance] = useState<IChartApi | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 400 });

  useImperativeHandle(ref, () => ({
    chart: chartRef.current,
    container: chartContainerRef.current
  }));

  // Helper: Detect if pane needed
  const hasMacd = indicators.some(i => i.config.type === 'MACD');

  // 1. Initialize Chart
  // 1. Initialize Chart (Mount Only)
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initial Layout
    const width = chartContainerRef.current.clientWidth;
    setDimensions({ width, height });

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(31, 41, 55, 0.5)' },
        horzLines: { color: 'rgba(31, 41, 55, 0.5)' },
      },
      width: width,
      height: height,
      timeScale: {
        borderColor: '#1F2937',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1F2937',
        visible: true,
      },
      crosshair: { mode: CrosshairMode.Normal }
    });

    const candlestickSeriesInstance = chart.addSeries(CandlestickSeries, {
      upColor: '#22C55E',
      downColor: '#EF4444',
      borderUpColor: '#22C55E',
      borderDownColor: '#EF4444',
      wickUpColor: '#22C55E',
      wickDownColor: '#EF4444',
    });

    // Volume (Overlay - Always at bottom)
    const volumeSeriesInstance = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeriesInstance.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candlestickSeriesInstance;
    volumeSeriesRef.current = volumeSeriesInstance;
    setChartInstance(chart); // Trigger re-render to mount DrawingManager

    // Capture refs for cleanup
    const currentIndicatorRefs = indicatorSeriesRefs.current;

    return () => {
      chart.remove();
      currentIndicatorRefs.clear();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      setChartInstance(null);
    };
  }, []); // Run once on mount, height handled by separate effect

  // 1.5 Handle Resize
  useEffect(() => {
    if (!autoResize || !chartContainerRef.current || !chartRef.current) return;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const newWidth = chartContainerRef.current.clientWidth;
        chartRef.current.applyOptions({ width: newWidth });
        setDimensions(d => ({ ...d, width: newWidth }));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [autoResize, chartInstance]);

  // 2. Handle Height Updates Efficiently
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({ height });
      setDimensions(d => ({ ...d, height }));
    }
  }, [height]);


  // 2. Update Data
  useEffect(() => {
    if (candleSeriesRef.current) candleSeriesRef.current.setData(data);
  }, [data]);

  // 2.1 Update Volume Data
  useEffect(() => {
    if (volumeSeriesRef.current && volumeData) {
      volumeSeriesRef.current.setData(volumeData);
    }
  }, [volumeData]);


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
    <div ref={chartContainerRef} className="w-full rounded-lg relative">
      {chartInstance && candleSeriesRef.current && dimensions.width > 0 && data && data.length > 0 && (
        <DrawingManager
          chart={chartInstance}
          mainSeries={candleSeriesRef.current}
          width={dimensions.width}
          height={height}
          data={data}
          symbol={symbol} // ✅ Pass Symbol
        />
      )}
    </div>
  );
});

BaseChart.displayName = 'BaseChart';
