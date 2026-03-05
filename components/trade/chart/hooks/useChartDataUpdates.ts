import { useEffect, type MutableRefObject } from 'react';
import type { CandlestickData, HistogramData, ISeriesApi } from 'lightweight-charts';
import type { ChartStyle } from '@/stores/trading/analysis.store';
import { trackAnalysisEvent } from '@/lib/analysis/telemetry';
import { toInstrumentKey } from '@/lib/market/symbol-normalization';
import { rebuildRenderTimeline } from '../utils/timeline';
import { toHeikinAshiData } from '../utils/heikinAshi';
import type { IntervalHintRef, LastAppliedDataRef, TimeMapRef } from '../types/chart.types';
import type { ChartController } from '@/lib/trading/chart-controller';

type UseChartDataUpdatesArgs = {
  controller: ChartController | null;
  data: CandlestickData[];
  volumeData?: HistogramData[];
  chartStyle: ChartStyle;
  symbol: string;
  instrumentKey?: string;
  range?: string;
  rawToRenderTimeRef: TimeMapRef;
  renderToRawTimeRef: TimeMapRef;
  intervalHintSecRef: IntervalHintRef;
  lastAppliedDataRef: LastAppliedDataRef;
  lineSeriesRef: MutableRefObject<ISeriesApi<'Line'> | null>;
  areaSeriesRef: MutableRefObject<ISeriesApi<'Area'> | null>;
  volumeSeriesRef: MutableRefObject<ISeriesApi<'Histogram'> | null>;
};

const toLineData = (rows: CandlestickData[]) =>
  rows.map((row: any) => ({
    time: row.time,
    value: Number(row.close),
  }));

export const useChartDataUpdates = ({
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
}: UseChartDataUpdatesArgs) => {
  useEffect(() => {
    if (!controller || !data || data.length === 0) {
      return;
    }

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

    const allowIncrementalCandleWrite = chartStyle !== 'HEIKIN_ASHI';

    if (allowIncrementalCandleWrite && (appendedNewestOnly || patchedNewestOnly) && lastCandle) {
      let renderTime = rawToRenderTimeRef.current.get(lastTime);

      if (!Number.isFinite(renderTime as number) && appendedNewestOnly && prev) {
        const rawGap = lastTime - prev.lastTime;
        const isSessionGap = rawGap > intervalHintSecRef.current * 2;

        renderTime = isSessionGap
          ? prev.lastRenderTime + intervalHintSecRef.current
          : prev.lastRenderTime + rawGap;

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
            name: 'chart_non_monotonic_candles',
            level: 'warn',
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

    const renderedData = rebuildRenderTimeline(
      data as CandlestickData[],
      rawToRenderTimeRef,
      renderToRawTimeRef,
      intervalHintSecRef,
    );
    const baseForPrimary = chartStyle === 'HEIKIN_ASHI' ? toHeikinAshiData(renderedData) : renderedData;
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
  }, [
    controller,
    data,
    symbol,
    instrumentKey,
    range,
    chartStyle,
    rawToRenderTimeRef,
    renderToRawTimeRef,
    intervalHintSecRef,
    lastAppliedDataRef,
    lineSeriesRef,
    areaSeriesRef,
  ]);

  useEffect(() => {
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
        console.warn('?? Failed to update volume data:', error);
        trackAnalysisEvent({
          name: 'chart_volume_update_failed',
          level: 'warn',
          payload: {
            symbol,
            instrumentKey,
          },
        });
      }
    }
  }, [volumeData, volumeSeriesRef, rawToRenderTimeRef, symbol, instrumentKey]);
};
