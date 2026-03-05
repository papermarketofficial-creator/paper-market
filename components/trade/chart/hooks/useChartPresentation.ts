import { useEffect, type MutableRefObject } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { ChartStyle } from '@/stores/trading/analysis.store';
import {
  CANDLE_TOP_MARGIN_WITH_VOLUME,
  CANDLE_BOTTOM_MARGIN_WITH_VOLUME,
  CANDLE_TOP_MARGIN_FULL,
  CANDLE_BOTTOM_MARGIN_FULL,
} from '../constants/chart.constants';

type UseChartPresentationArgs = {
  chart: IChartApi | null;
  candleSeriesRef: MutableRefObject<ISeriesApi<'Candlestick'> | null>;
  lineSeriesRef: MutableRefObject<ISeriesApi<'Line'> | null>;
  areaSeriesRef: MutableRefObject<ISeriesApi<'Area'> | null>;
  volumeSeriesRef: MutableRefObject<ISeriesApi<'Histogram'> | null>;
  hasMacd: boolean;
  showVolume: boolean;
  chartStyle: ChartStyle;
};

export const useChartPresentation = ({
  chart,
  candleSeriesRef,
  lineSeriesRef,
  areaSeriesRef,
  volumeSeriesRef,
  hasMacd,
  showVolume,
  chartStyle,
}: UseChartPresentationArgs) => {
  useEffect(() => {
    if (!chart || !candleSeriesRef.current) return;

    const topWithVolume = CANDLE_TOP_MARGIN_WITH_VOLUME;
    const bottomWithVolume = CANDLE_BOTTOM_MARGIN_WITH_VOLUME;
    if (hasMacd) {
      candleSeriesRef.current.priceScale().applyOptions({
        scaleMargins: {
          top: showVolume ? topWithVolume : CANDLE_TOP_MARGIN_FULL,
          bottom: showVolume ? bottomWithVolume : CANDLE_BOTTOM_MARGIN_FULL,
        },
      });
    } else {
      candleSeriesRef.current.priceScale().applyOptions({
        scaleMargins: {
          top: showVolume ? topWithVolume : CANDLE_TOP_MARGIN_FULL,
          bottom: showVolume ? bottomWithVolume : CANDLE_BOTTOM_MARGIN_FULL,
        },
      });
    }
  }, [chart, candleSeriesRef, hasMacd, showVolume]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const lineSeries = lineSeriesRef.current;
    const areaSeries = areaSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !lineSeries || !areaSeries) return;

    const isCandleMode = chartStyle === 'CANDLE' || chartStyle === 'HEIKIN_ASHI';
    candleSeries.applyOptions({
      visible: isCandleMode,
      upColor: chartStyle === 'HEIKIN_ASHI' ? '#22C55E' : '#089981',
      downColor: chartStyle === 'HEIKIN_ASHI' ? '#EF4444' : '#F23645',
      borderUpColor: chartStyle === 'HEIKIN_ASHI' ? '#22C55E' : '#089981',
      borderDownColor: chartStyle === 'HEIKIN_ASHI' ? '#EF4444' : '#F23645',
      wickUpColor: chartStyle === 'HEIKIN_ASHI' ? '#22C55E' : '#089981',
      wickDownColor: chartStyle === 'HEIKIN_ASHI' ? '#EF4444' : '#F23645',
    });

    lineSeries.applyOptions({
      visible: chartStyle === 'LINE',
    });

    areaSeries.applyOptions({
      visible: chartStyle === 'AREA',
    });

    if (volumeSeries) {
      volumeSeries.applyOptions({
        visible: showVolume,
      });
    }
  }, [chartStyle, showVolume, candleSeriesRef, lineSeriesRef, areaSeriesRef, volumeSeriesRef]);
};
