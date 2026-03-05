import { useEffect, type MutableRefObject } from 'react';
import type { IChartApi } from 'lightweight-charts';
import { trackAnalysisEvent } from '@/lib/analysis/telemetry';
import { LEFT_EDGE_TRIGGER_BARS, LOAD_MORE_LOCK_TIMEOUT_MS } from '../constants/chart.constants';

type RangeState = { from: number; to: number };

type UseInfiniteScrollArgs = {
  chart: IChartApi | null;
  onLoadMoreRef: MutableRefObject<(() => Promise<void> | void) | undefined>;
  isFetchingRef: MutableRefObject<boolean>;
  previousLogicalRangeRef: MutableRefObject<RangeState | null>;
  symbol: string;
  instrumentKey?: string;
};

export const useInfiniteScroll = ({
  chart,
  onLoadMoreRef,
  isFetchingRef,
  previousLogicalRangeRef,
  symbol,
  instrumentKey,
}: UseInfiniteScrollArgs) => {
  useEffect(() => {
    if (!chart) return;

    const onRangeChange = (range: any) => {
      if (!range) return;

      const currentRange = {
        from: Number(range.from),
        to: Number(range.to),
      };

      const previousRange = previousLogicalRangeRef.current;
      previousLogicalRangeRef.current = currentRange;

      if (!previousRange) return;

      const movedLeft = currentRange.from < previousRange.from;
      const nearLeftEdge = currentRange.from < LEFT_EDGE_TRIGGER_BARS;
      if (!movedLeft || !nearLeftEdge || isFetchingRef.current) return;

      const loadMore = onLoadMoreRef.current;
      if (loadMore) {
        isFetchingRef.current = true;
        let released = false;
        const releaseLock = () => {
          if (released) return;
          released = true;
          isFetchingRef.current = false;
        };

        const lockTimeout = setTimeout(() => {
          console.warn(`Infinite scroll lock timeout (${LOAD_MORE_LOCK_TIMEOUT_MS}ms). Releasing lock.`);
          releaseLock();
        }, LOAD_MORE_LOCK_TIMEOUT_MS);

        try {
          Promise.resolve(loadMore())
            .catch((error) => {
              console.error('Infinite scroll load-more failed:', error);
              trackAnalysisEvent({
                name: 'chart_load_more_failed',
                level: 'warn',
                payload: {
                  symbol,
                  instrumentKey,
                },
              });
            })
            .finally(() => {
              clearTimeout(lockTimeout);
              releaseLock();
            });
        } catch (error) {
          clearTimeout(lockTimeout);
          releaseLock();
          console.error('Infinite scroll load-more threw synchronously:', error);
          trackAnalysisEvent({
            name: 'chart_load_more_failed_sync',
            level: 'warn',
            payload: {
              symbol,
              instrumentKey,
            },
          });
        }
      } else {
        console.warn('Infinite scroll triggered but no onLoadMore callback');
      }
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
    };
  }, [chart, onLoadMoreRef, isFetchingRef, previousLogicalRangeRef, symbol, instrumentKey]);
};
