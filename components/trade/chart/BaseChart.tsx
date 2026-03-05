"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { DrawingManager } from './overlays/DrawingManager';
import { resolveDisplayTime as resolveDisplayTimeUtil } from './utils/timeline';
import { useChartInstance } from './hooks/useChartInstance';
import { useChartController } from './hooks/useChartController';
import { useChartDataUpdates } from './hooks/useChartDataUpdates';
import { useInfiniteScroll } from './hooks/useInfiniteScroll';
import { useChartResize } from './hooks/useChartResize';
import { useIndicators } from './hooks/useIndicators';
import { useChartPresentation } from './hooks/useChartPresentation';
import type { BaseChartProps, BaseChartRef, LastAppliedData } from './types/chart.types';

export const BaseChart = forwardRef<BaseChartRef, BaseChartProps>(({
  data,
  volumeData,
  indicators = [],
  height,
  autoResize = true,
  symbol,
  instrumentKey,
  range,
  chartStyle = 'CANDLE',
  showVolume = true,
  onHoverCandleChange,
  onChartReady,
  onLoadMore,
}, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const indicatorSeriesRefs = useRef<Map<string, ISeriesApi<any>[]>>(new Map());
  const isFetchingRef = useRef(false);
  const previousLogicalRangeRef = useRef<{ from: number; to: number } | null>(null);
  const rawToRenderTimeRef = useRef<Map<number, number>>(new Map());
  const renderToRawTimeRef = useRef<Map<number, number>>(new Map());
  const intervalHintSecRef = useRef<number>(60);
  const lastAppliedDataRef = useRef<LastAppliedData | null>(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: height ?? 400 });

  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  const onHoverCandleChangeRef = useRef(onHoverCandleChange);
  useEffect(() => {
    onHoverCandleChangeRef.current = onHoverCandleChange;
  }, [onHoverCandleChange]);

  const resolveDisplayTime = useCallback(
    (time: number) => resolveDisplayTimeUtil(time, renderToRawTimeRef),
    [],
  );

  const { chartInstance } = useChartInstance({
    chartContainerRef,
    chartRef,
    candleSeriesRef,
    lineSeriesRef,
    areaSeriesRef,
    volumeSeriesRef,
    height,
    onChartReady,
    onHoverCandleChangeRef,
    resolveDisplayTime,
    setDimensions,
  });

  useInfiniteScroll({
    chart: chartInstance,
    onLoadMoreRef,
    isFetchingRef,
    previousLogicalRangeRef,
    symbol,
    instrumentKey,
  });

  const controller = useChartController({
    candleSeriesRef,
    symbol,
    instrumentKey,
    rawToRenderTimeRef,
    renderToRawTimeRef,
    intervalHintSecRef,
    lastAppliedDataRef,
  });

  useChartDataUpdates({
    controller,
    data,
    volumeData,
    chartStyle,
    symbol,
    instrumentKey,
    range,
    rawToRenderTimeRef,
    renderToRawTimeRef,
    intervalHintSecRef,
    lastAppliedDataRef,
    lineSeriesRef,
    areaSeriesRef,
    volumeSeriesRef,
  });

  useChartResize({
    autoResize,
    chart: chartInstance,
    chartContainerRef,
    chartInstance,
    height,
    setDimensions,
  });

  const hasMacd = indicators.some((i) => i.config.type === 'MACD');

  useChartPresentation({
    chart: chartInstance,
    candleSeriesRef,
    lineSeriesRef,
    areaSeriesRef,
    volumeSeriesRef,
    hasMacd,
    showVolume,
    chartStyle,
  });

  useIndicators({
    chart: chartInstance,
    indicators,
    indicatorSeriesRefs,
  });

  useImperativeHandle(ref, () => ({
    chart: chartRef.current,
    container: chartContainerRef.current,
  }));

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
