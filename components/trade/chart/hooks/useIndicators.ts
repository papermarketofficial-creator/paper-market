import { useEffect, type MutableRefObject } from 'react';
import { HistogramSeries, LineSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import type { ChartIndicatorInput } from '../types/chart.types';

type UseIndicatorsArgs = {
  chart: IChartApi | null;
  indicators: ChartIndicatorInput[];
  indicatorSeriesRefs: MutableRefObject<Map<string, ISeriesApi<any>[]>>;
};

export const useIndicators = ({ chart, indicators, indicatorSeriesRefs }: UseIndicatorsArgs) => {
  useEffect(() => {
    if (!chart) return;

    const currentIds = new Set(indicators.map((i) => i.config.id));

    indicatorSeriesRefs.current.forEach((seriesArray, id) => {
      if (!currentIds.has(id)) {
        seriesArray.forEach((s) => chart.removeSeries(s));
        indicatorSeriesRefs.current.delete(id);
      }
    });

    indicators.forEach(({ config, data, series }) => {
      const existing = indicatorSeriesRefs.current.get(config.id);

      if (config.type === 'MACD' && series) {
        if (!existing) {
          const paneId = 'MACD';

          const hist = chart.addSeries(HistogramSeries, {
            priceScaleId: paneId,
            color: config.seriesColors?.histogram || '#26a69a',
          });

          const macdLine = chart.addSeries(LineSeries, {
            priceScaleId: paneId,
            color: config.seriesColors?.macd || '#2962FF',
            lineWidth: 1,
            title: 'MACD',
          });

          const sigLine = chart.addSeries(LineSeries, {
            priceScaleId: paneId,
            color: config.seriesColors?.signal || '#FF6D00',
            lineWidth: 1,
            title: 'Signal',
          });

          chart.priceScale(paneId).applyOptions({
            scaleMargins: { top: 0.75, bottom: 0 },
          });

          indicatorSeriesRefs.current.set(config.id, [hist, macdLine, sigLine]);

          hist.setData(series.histogram || []);
          macdLine.setData(series.macd || []);
          sigLine.setData(series.signal || []);
        } else {
          const [hist, macdLine, sigLine] = existing;
          hist.setData(series.histogram || []);
          macdLine.setData(series.macd || []);
          sigLine.setData(series.signal || []);
        }
      } else if (config.type === 'BB' && series) {
        if (!existing) {
          const upper = chart.addSeries(LineSeries, {
            color: config.display.color || '#2962FF',
            lineWidth: 1,
            title: 'BB Upper',
          });
          const lower = chart.addSeries(LineSeries, {
            color: config.display.color || '#2962FF',
            lineWidth: 1,
            title: 'BB Lower',
          });
          const middle = chart.addSeries(LineSeries, {
            color: '#FF6D00',
            lineWidth: 1,
            title: 'BB Middle',
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
      } else {
        if (!existing) {
          const s = chart.addSeries(LineSeries, {
            color: config.display.color,
            lineWidth: Math.max(1, Math.min(4, Number(config.display.lineWidth || 2))) as any,
            priceScaleId: config.type === 'RSI' ? 'RSI' : 'right',
            title: `${config.type} ${config.params?.period || ''}`.trim(),
          });

          if (config.type === 'RSI') {
            chart.priceScale('RSI').applyOptions({
              scaleMargins: { top: 0.8, bottom: 0.05 },
            });
          }

          indicatorSeriesRefs.current.set(config.id, [s]);
          s.setData(data);
        } else {
          existing[0].setData(data);
        }
      }
    });
  }, [chart, indicators, indicatorSeriesRefs]);
};
