import type { MutableRefObject } from 'react';
import type { IChartApi, CandlestickData, HistogramData, ISeriesApi } from 'lightweight-charts';
import type { ChartStyle, IndicatorConfig } from '@/stores/trading/analysis.store';

export type IndicatorSeriesData = {
  macd?: any[];
  signal?: any[];
  histogram?: any[];
  middle?: any[];
  upper?: any[];
  lower?: any[];
};

export type ChartIndicatorInput = {
  config: IndicatorConfig;
  data: any[];
  series?: IndicatorSeriesData;
};

export interface BaseChartProps {
  data: CandlestickData[];
  volumeData?: HistogramData[];
  indicators?: ChartIndicatorInput[];
  height?: number;
  autoResize?: boolean;
  symbol: string;
  instrumentKey?: string;
  range?: string;
  chartStyle?: ChartStyle;
  showVolume?: boolean;
  onHotkeyAction?: (action: string) => void;
  onHoverCandleChange?: (candle: CandlestickData | null) => void;
  onChartReady?: (api: IChartApi) => void;
  onLoadMore?: () => Promise<void> | void;
}

export interface BaseChartRef {
  chart: IChartApi | null;
  container: HTMLDivElement | null;
}

export type TimeMapRef = MutableRefObject<Map<number, number>>;
export type IntervalHintRef = MutableRefObject<number>;

export type LastAppliedData = {
  symbolKey: string;
  rangeKey: string;
  length: number;
  firstTime: number;
  lastTime: number;
  lastRenderTime: number;
  lastOpen: number;
  lastHigh: number;
  lastLow: number;
  lastClose: number;
};

export type LastAppliedDataRef = MutableRefObject<LastAppliedData | null>;

export type SeriesRefs = {
  candleSeriesRef: MutableRefObject<ISeriesApi<'Candlestick'> | null>;
  lineSeriesRef: MutableRefObject<ISeriesApi<'Line'> | null>;
  areaSeriesRef: MutableRefObject<ISeriesApi<'Area'> | null>;
  volumeSeriesRef: MutableRefObject<ISeriesApi<'Histogram'> | null>;
};
