import { useEffect, useState, type MutableRefObject } from 'react';
import type { ISeriesApi } from 'lightweight-charts';
import { ChartController } from '@/lib/trading/chart-controller';
import { chartRegistry } from '@/lib/trading/chart-registry';
import { toCanonicalSymbol, toInstrumentKey } from '@/lib/market/symbol-normalization';
import type { LastAppliedDataRef, TimeMapRef, IntervalHintRef } from '../types/chart.types';

type UseChartControllerArgs = {
  candleSeriesRef: MutableRefObject<ISeriesApi<'Candlestick'> | null>;
  symbol: string;
  instrumentKey?: string;
  rawToRenderTimeRef: TimeMapRef;
  renderToRawTimeRef: TimeMapRef;
  intervalHintSecRef: IntervalHintRef;
  lastAppliedDataRef: LastAppliedDataRef;
};

export const useChartController = ({
  candleSeriesRef,
  symbol,
  instrumentKey,
  rawToRenderTimeRef,
  renderToRawTimeRef,
  intervalHintSecRef,
  lastAppliedDataRef,
}: UseChartControllerArgs): ChartController | null => {
  const [controller, setController] = useState<ChartController | null>(null);

  useEffect(() => {
    if (!candleSeriesRef.current || !symbol) return;
    const registrySymbol = toCanonicalSymbol(symbol);
    const registryInstrumentKey = toInstrumentKey(instrumentKey || registrySymbol);
    rawToRenderTimeRef.current = new Map();
    renderToRawTimeRef.current = new Map();
    intervalHintSecRef.current = 60;
    lastAppliedDataRef.current = null;

    const nextController = new ChartController(`chart-${registryInstrumentKey}`);
    nextController.setSeries(candleSeriesRef.current);
    setController(nextController);

    chartRegistry.register(registryInstrumentKey, nextController);

    return () => {
      chartRegistry.unregister(registryInstrumentKey);
      nextController.destroy();
      setController(null);
    };
  }, [symbol, instrumentKey, candleSeriesRef, rawToRenderTimeRef, renderToRawTimeRef, intervalHintSecRef, lastAppliedDataRef]);

  return controller;
};
