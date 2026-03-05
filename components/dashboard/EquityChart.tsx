"use client";
import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, AreaSeries, AreaData, Time } from 'lightweight-charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface EquityChartProps {
  data: { time: number; value: number }[];
  loading?: boolean;
}

export function EquityChart({ data, loading = false }: EquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || loading) return;

    const containerWidth = chartContainerRef.current.clientWidth;
    const chartHeight = isMobile ? 220 : 320;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(31, 41, 55, 0.5)' },
        horzLines: { color: 'rgba(31, 41, 55, 0.5)' },
      },
      width: containerWidth,
      height: chartHeight,
      timeScale: {
        borderColor: '#1F2937',
        timeVisible: !isMobile,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1F2937',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#22C55E',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: '#22C55E',
          width: 1,
          style: 2,
        },
      },
      handleScale: {
        axisPressedMouseMove: !isMobile,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#22C55E',
      topColor: 'rgba(34, 197, 94, 0.4)',
      bottomColor: 'rgba(34, 197, 94, 0.0)',
      lineWidth: 2,
    });

    const formattedData: AreaData<Time>[] = data.map((item) => ({
      time: (item.time / 1000) as Time,
      value: item.value,
    }));

    areaSeries.setData(formattedData);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (chartRef.current && width > 0) {
          chartRef.current.applyOptions({ width });
        }
      }
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data, loading, isMobile]);

  if (loading) {
    return (
      <Card className="bg-card border-border overflow-hidden">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-foreground text-base sm:text-lg">Equity Curve</CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-6 pt-0">
          <Skeleton className="h-[220px] sm:h-[320px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-foreground text-base sm:text-lg">Equity Curve</CardTitle>
      </CardHeader>
      <CardContent className="p-2 sm:p-6 pt-0">
        <div ref={chartContainerRef} className="w-full h-[220px] sm:h-[320px]" />
      </CardContent>
    </Card>
  );
}
