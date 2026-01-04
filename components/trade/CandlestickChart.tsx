"use client";
import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, CandlestickData, Time, HistogramSeries, HistogramData } from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

interface CandlestickChartProps {
  symbol: string;
}

// Generate sample candlestick data
const generateCandlestickData = (count: number): CandlestickData[] => {
  const data: CandlestickData[] = [];
  let time = Date.now() - count * 60 * 1000; // Start from count minutes ago
  let price = 100; // Starting price

  for (let i = 0; i < count; i++) {
    const volatility = 2;
    const open = price;
    const close = open + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;

    data.push({
      time: (time / 1000) as Time,
      open,
      high,
      low,
      close,
    });

    price = close;
    time += 60 * 1000; // Add 1 minute
  }

  return data;
};

// Generate volume data from candlestick data
const generateVolumeData = (candlestickData: CandlestickData[]): HistogramData[] => {
  return candlestickData.map((candle) => ({
    time: candle.time,
    value: Math.floor(Math.random() * 1000000) + 100000, // Random volume between 100k-1.1M
    color: candle.close > candle.open ? '#22C55E' : '#EF4444',
  }));
};

export function CandlestickChart({ symbol }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('5m');

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(31, 41, 55, 0.5)' },
        horzLines: { color: 'rgba(31, 41, 55, 0.5)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        borderColor: '#1F2937',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1F2937',
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#3B82F6',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: '#3B82F6',
          width: 1,
          style: 2,
        },
      },
    });

    const candlestickSeriesInstance = chart.addSeries(CandlestickSeries, {
      upColor: '#22C55E',
      downColor: '#EF4444',
      borderUpColor: '#22C55E',
      borderDownColor: '#EF4444',
      wickUpColor: '#22C55E',
      wickDownColor: '#EF4444',
    });

    const volumeSeriesInstance = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    volumeSeriesInstance.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    const candleData = generateCandlestickData(100);
    const volumeData = generateVolumeData(candleData);

    candlestickSeriesInstance.setData(candleData);
    volumeSeriesInstance.setData(volumeData);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    candleSeriesRef.current = candlestickSeriesInstance;
    volumeSeriesRef.current = volumeSeriesInstance;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol, selectedTimeframe]);

  return (
    <div className="space-y-4">
      {/* Timeframe Selector */}
      <div className="flex items-center gap-2">
        {timeframes.map((tf) => (
          <Button
            key={tf}
            variant={selectedTimeframe === tf ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedTimeframe(tf)}
            className={cn(
              'text-xs',
              selectedTimeframe === tf
                ? 'bg-secondary text-secondary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {tf}
          </Button>
        ))}
      </div>

      {/* Chart */}
      <div ref={chartContainerRef} className="w-full rounded-lg" />
    </div>
  );
}
