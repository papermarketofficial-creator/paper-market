import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts';
import {
  CANDLE_TOP_MARGIN_WITH_VOLUME,
  CANDLE_BOTTOM_MARGIN_WITH_VOLUME,
  VOLUME_TOP_MARGIN,
  VOLUME_BOTTOM_MARGIN,
} from '../constants/chart.constants';
import { getChartPalette } from '../utils/chartPalette';

type Dimensions = { width: number; height: number };

type UseChartInstanceArgs = {
  chartContainerRef: MutableRefObject<HTMLDivElement | null>;
  chartRef: MutableRefObject<IChartApi | null>;
  candleSeriesRef: MutableRefObject<ISeriesApi<'Candlestick'> | null>;
  lineSeriesRef: MutableRefObject<ISeriesApi<'Line'> | null>;
  areaSeriesRef: MutableRefObject<ISeriesApi<'Area'> | null>;
  volumeSeriesRef: MutableRefObject<ISeriesApi<'Histogram'> | null>;
  height?: number;
  onChartReady?: (api: IChartApi) => void;
  onHoverCandleChangeRef: MutableRefObject<((candle: CandlestickData | null) => void) | undefined>;
  resolveDisplayTime: (time: number) => number;
  setDimensions: Dispatch<SetStateAction<Dimensions>>;
};

export const useChartInstance = ({
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
}: UseChartInstanceArgs): { chartInstance: IChartApi | null } => {
  const monthFormatter = useRef(new Intl.DateTimeFormat('en-IN', { month: 'short' }));
  const dayFormatter = useRef(new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }));
  const timeFormatter = useRef(new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }));
  const yearFormatter = useRef(new Intl.DateTimeFormat('en-IN', { year: 'numeric' }));
  const [chartInstance, setChartInstance] = useState<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const width = chartContainerRef.current.clientWidth;
    const initialHeight = chartContainerRef.current.clientHeight || height || 400;
    const palette = getChartPalette();
    setDimensions({ width, height: initialHeight });

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: palette.textColor,
      },
      grid: {
        vertLines: { color: palette.gridColor, style: 2 },
        horzLines: { color: palette.gridColor, style: 2 },
      },
      width,
      height: initialHeight,
      timeScale: {
        borderColor: palette.borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightBarStaysOnScroll: true,
        lockVisibleTimeRangeOnResize: true,
        ignoreWhitespaceIndices: true,
        rightOffset: 12,
        tickMarkFormatter: (time: number, tickMarkType: number) => {
          const date = new Date(resolveDisplayTime(time) * 1000);
          switch (tickMarkType) {
            case 0:
              return yearFormatter.current.format(date);
            case 1:
              return monthFormatter.current.format(date);
            case 2:
              return dayFormatter.current.format(date);
            case 3:
            case 4:
              return timeFormatter.current.format(date);
            default:
              return dayFormatter.current.format(date);
          }
        },
      },
      rightPriceScale: {
        borderColor: palette.borderColor,
        visible: true,
        autoScale: true,
      },
      localization: {
        timeFormatter: (time: number) => {
          const date = new Date(resolveDisplayTime(time) * 1000);
          const timeStr = date.toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          const isDailyOrHigher = timeStr === '00:00';

          if (isDailyOrHigher) {
            return date.toLocaleDateString('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
          }

          return date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
        },
      },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const candlestickSeriesInstance = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#F23645',
      borderUpColor: '#089981',
      borderDownColor: '#F23645',
      wickUpColor: '#089981',
      wickDownColor: '#F23645',
    });

    const lineSeriesInstance = chart.addSeries(LineSeries, {
      color: '#60A5FA',
      lineWidth: 2,
      visible: false,
      priceScaleId: 'right',
      lastValueVisible: true,
      priceLineVisible: false,
    });

    const areaSeriesInstance = chart.addSeries(AreaSeries, {
      lineColor: '#38BDF8',
      topColor: 'rgba(56, 189, 248, 0.35)',
      bottomColor: 'rgba(56, 189, 248, 0.02)',
      lineWidth: 2,
      visible: false,
      priceScaleId: 'right',
      lastValueVisible: true,
      priceLineVisible: false,
    });

    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: CANDLE_TOP_MARGIN_WITH_VOLUME,
        bottom: CANDLE_BOTTOM_MARGIN_WITH_VOLUME,
      },
    });

    const volumeSeriesInstance = chart.addSeries(HistogramSeries, {
      color: palette.volumeColor,
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: VOLUME_TOP_MARGIN,
        bottom: VOLUME_BOTTOM_MARGIN,
      },
    });

    const applyChartPalette = () => {
      const nextPalette = getChartPalette();
      chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: nextPalette.textColor,
        },
        grid: {
          vertLines: { color: nextPalette.gridColor, style: 2 },
          horzLines: { color: nextPalette.gridColor, style: 2 },
        },
        timeScale: {
          borderColor: nextPalette.borderColor,
        },
        rightPriceScale: {
          borderColor: nextPalette.borderColor,
        },
      });
      volumeSeriesInstance.applyOptions({
        color: nextPalette.volumeColor,
      });
    };
    applyChartPalette();

    const themeObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                applyChartPalette();
                break;
              }
            }
          })
        : null;

    if (themeObserver && typeof document !== 'undefined') {
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    const handleCrosshairMove = (param: any) => {
      const callback = onHoverCandleChangeRef.current;
      if (!callback) return;
      const row = param?.seriesData?.get?.(candlestickSeriesInstance) as any;
      if (!row) {
        callback(null);
        return;
      }
      const renderTime = Number(row.time);
      callback({
        time: resolveDisplayTime(renderTime) as any,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
      });
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    chartRef.current = chart;
    candleSeriesRef.current = candlestickSeriesInstance;
    lineSeriesRef.current = lineSeriesInstance;
    areaSeriesRef.current = areaSeriesInstance;
    volumeSeriesRef.current = volumeSeriesInstance;
    setChartInstance(chart);

    if (onChartReady) {
      onChartReady(chart);
    }

    return () => {
      themeObserver?.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveDisplayTime]);

  return { chartInstance };
};
