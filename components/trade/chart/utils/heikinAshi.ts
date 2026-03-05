import type { CandlestickData } from 'lightweight-charts';

export const toHeikinAshiData = (rows: CandlestickData[]): CandlestickData[] => {
  if (!rows.length) return rows;

  const output: CandlestickData[] = [];
  let prevOpen = 0;
  let prevClose = 0;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index] as any;
    const open = Number(row.open);
    const high = Number(row.high);
    const low = Number(row.low);
    const close = Number(row.close);
    const haClose = (open + high + low + close) / 4;
    const haOpen = index === 0 ? (open + close) / 2 : (prevOpen + prevClose) / 2;
    const haHigh = Math.max(high, haOpen, haClose);
    const haLow = Math.min(low, haOpen, haClose);

    output.push({
      ...row,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    });

    prevOpen = haOpen;
    prevClose = haClose;
  }

  return output;
};
