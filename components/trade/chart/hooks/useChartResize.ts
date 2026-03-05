import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { IChartApi } from 'lightweight-charts';

type Dimensions = { width: number; height: number };

type UseChartResizeArgs = {
  autoResize: boolean;
  chart: IChartApi | null;
  chartContainerRef: MutableRefObject<HTMLDivElement | null>;
  chartInstance: IChartApi | null;
  height?: number;
  setDimensions: Dispatch<SetStateAction<Dimensions>>;
};

export const useChartResize = ({
  autoResize,
  chart,
  chartContainerRef,
  chartInstance,
  height,
  setDimensions,
}: UseChartResizeArgs) => {
  useEffect(() => {
    if (!autoResize || !chartContainerRef.current || !chart) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height: nextHeight } = entries[0].contentRect;

      chart.applyOptions({ width, height: nextHeight });
      setDimensions({ width, height: nextHeight });
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => resizeObserver.disconnect();
  }, [autoResize, chartContainerRef, chart, chartInstance, setDimensions]);

  useEffect(() => {
    if (typeof height === 'number' && height > 0 && chart) {
      chart.applyOptions({ height });
      setDimensions((d) => ({ ...d, height }));
    }
  }, [height, chart, setDimensions]);
};
