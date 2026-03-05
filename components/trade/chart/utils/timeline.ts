import type { CandlestickData } from 'lightweight-charts';
import type { IntervalHintRef, TimeMapRef } from '../types/chart.types';

export const detectIntervalHintSec = (rows: CandlestickData[]): number => {
  if (rows.length < 2) return 60;
  const counts = new Map<number, number>();
  let fallback = 60;

  for (let i = 1; i < rows.length; i++) {
    const prev = Number(rows[i - 1]?.time);
    const curr = Number(rows[i]?.time);
    const diff = Math.round(curr - prev);
    if (!Number.isFinite(diff) || diff <= 0) continue;
    if (diff < fallback || fallback <= 0) fallback = diff;
    if (diff > 86_400 * 7) continue;
    counts.set(diff, (counts.get(diff) ?? 0) + 1);
  }

  let best = 0;
  let bestCount = -1;
  for (const [diff, count] of counts.entries()) {
    if (count > bestCount || (count === bestCount && diff < best)) {
      best = diff;
      bestCount = count;
    }
  }

  if (best > 0) return best;
  return fallback > 0 ? fallback : 60;
};

export const rebuildRenderTimeline = (
  rows: CandlestickData[],
  rawToRenderTimeRef: TimeMapRef,
  renderToRawTimeRef: TimeMapRef,
  intervalHintSecRef: IntervalHintRef,
): CandlestickData[] => {
  rawToRenderTimeRef.current = new Map();
  renderToRawTimeRef.current = new Map();
  if (!rows.length) return rows;

  const intervalHint = detectIntervalHintSec(rows);
  intervalHintSecRef.current = intervalHint;
  const sessionGapThreshold = intervalHint * 2;

  const mapped: CandlestickData[] = new Array(rows.length);
  let renderTime = Number(rows[0].time);

  for (let i = 0; i < rows.length; i++) {
    const rawTime = Number(rows[i].time);

    if (i > 0) {
      const prevRaw = Number(rows[i - 1].time);
      const rawGap = rawTime - prevRaw;

      if (rawGap > sessionGapThreshold) {
        renderTime += intervalHint;
      } else {
        renderTime += rawGap;
      }
    }

    rawToRenderTimeRef.current.set(rawTime, renderTime);
    renderToRawTimeRef.current.set(renderTime, rawTime);
    mapped[i] = {
      ...rows[i],
      time: renderTime as any,
    };
  }

  return mapped;
};

export const resolveDisplayTime = (time: number, renderToRawTimeRef: TimeMapRef): number => {
  const t = Number(time);
  if (!Number.isFinite(t)) return t;
  return renderToRawTimeRef.current.get(Math.floor(t)) ?? t;
};
