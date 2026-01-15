"use client";
import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { CandlestickData, HistogramData, Time } from 'lightweight-charts';
import { useAnalysisStore } from '@/stores/trading/analysis.store';
import { SMA, RSI, MACD } from 'technicalindicators';

// Dynamic imports to avoid SSR issues with LWC
const BaseChart = dynamic(() => import('./BaseChart').then(mod => mod.BaseChart), { ssr: false });
const AnalysisOverlay = dynamic(() => import('../analysis/AnalysisOverlay').then(mod => mod.AnalysisOverlay), { ssr: false });

interface ChartContainerProps {
  symbol: string;
}

// Reuse the generation logic from previous file for now (Phase 1)
// Add timeframe param
const generateData = (count: number, timeframe: string) => {
  const data: CandlestickData[] = [];
  // Fixed timestamp to stop "real-time" simulation effect
  const FIXED_TIME = 1714560000000; // May 1, 2024

  // Interval multiplier (minutes)
  const interval = timeframe === '1m' ? 1 : timeframe === '5m' ? 5 : timeframe === '15m' ? 15 : 60;

  let time = Math.floor(FIXED_TIME / 1000) - count * 60 * interval;
  let price = 100;

  for (let i = 0; i < count; i++) {
    const volatility = 0.5 * Math.sqrt(interval); // More vol for higher TF
    const open = price;
    const close = open + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;

    data.push({
      time: time as Time,
      open, high, low, close
    });

    price = close;
    time += 60 * interval;
  }
  return data;
};

const generateVol = (data: CandlestickData[]) => {
  return data.map(d => ({
    time: d.time,
    value: Math.random() * 1000,
    color: (d.close as number) > (d.open as number) ? '#22C55E' : '#EF4444'
  } as HistogramData));
}

export function ChartContainer({ symbol }: ChartContainerProps) {
  const {
    isAnalysisMode,
    activeTool,
    getIndicators,
    getDrawings,
    timeframe // New
  } = useAnalysisStore();

  const indicators = getIndicators(symbol);
  const drawings = getDrawings(symbol);

  const [data, setData] = useState<CandlestickData[]>([]);
  const [volData, setVolData] = useState<HistogramData[]>([]);

  // 1. Data Fetching (Mock)
  useEffect(() => {
    // Reset interaction on symbol change
    useAnalysisStore.getState().cancelDrawing();

    // Simulate fetch
    const d = generateData(1000, timeframe); // Respect timeframe
    setData(d);
    setVolData(generateVol(d));
  }, [symbol, timeframe]); // Reload on timeframe change

  // ... (Indicators calc remains same) ...
  // Indictor logic omitted for brevity in replace, only targeting Data Fetching block?
  // No, I need to keep the file valid. I will target the top part only.

  // 3. Event Handlers
  // Removed handleChartClick as DrawingManager handles it now.

  // chartProps definition moved to end of component

  // 2. Indicator Calculation (Memoized & Safe)
  const computedIndicators = useMemo(() => {
    if (data.length === 0) return [];

    const closes = data.map(d => d.close as number);

    return indicators.map(ind => {
      // Safety Guard: Insufficient data
      const period = ind.period || 14;
      if (data.length < period) return { config: ind, data: [] };

      let results: any = [];

      try {
        if (ind.type === 'SMA') {
          const sma = SMA.calculate({ period, values: closes });
          results = sma.map((val, i) => {
            const dataIndex = i + period - 1;
            if (!data[dataIndex]) return null;
            return { time: data[dataIndex].time, value: val };
          }).filter(Boolean);
          return { config: ind, data: results };
        }
        else if (ind.type === 'RSI') {
          const rsi = RSI.calculate({ period, values: closes });
          results = rsi.map((val, i) => {
            const dataIndex = i + period;
            if (!data[dataIndex]) return null;
            return { time: data[dataIndex].time, value: val };
          }).filter(Boolean);
          return { config: ind, data: results };
        }
        else if (ind.type === 'MACD') {
          const fast = ind.fastPeriod || 12;
          const slow = ind.slowPeriod || 26;
          const signal = ind.signalPeriod || 9;

          if (data.length < (slow + signal)) return { config: ind, data: [] };

          const macd = MACD.calculate({
            values: closes,
            fastPeriod: fast,
            slowPeriod: slow,
            signalPeriod: signal,
            SimpleMAOscillator: false,
            SimpleMASignal: false
          });

          // Align results
          const offset = data.length - macd.length;

          const mapSafe = (val: number, i: number) => {
            const d = data[i + offset];
            return d ? { time: d.time, value: val } : null;
          };

          const macdData = macd.map((val, i) => val.MACD !== undefined ? mapSafe(val.MACD, i) : null).filter(Boolean);
          const signalData = macd.map((val, i) => val.signal !== undefined ? mapSafe(val.signal, i) : null).filter(Boolean);
          const histogramData = macd.map((val, i) => {
            const d = data[i + offset];
            return d ? {
              time: d.time,
              value: val.histogram,
              color: (val.histogram || 0) > 0 ? '#26a69a' : '#ef5350'
            } : null;
          }).filter(Boolean);

          return {
            config: ind,
            data: macdData,
            series: {
              macd: macdData,
              signal: signalData,
              histogram: histogramData
            }
          };
        }
      } catch (e) {
        console.error("Indicator Calc Error", e);
        return { config: ind, data: [] };
      }

      return { config: ind, data: [] };
    });
  }, [data, indicators]);

  const chartProps = {
    data,
    volumeData: volData,
    indicators: computedIndicators,
    drawings,
    activeTool,
  };

  return (
    <div className="relative w-full h-full group">
      {/* Normal View */}
      {!isAnalysisMode && (
        <div className="relative w-full">
          <BaseChart {...chartProps} height={400} symbol={symbol} />


        </div>
      )}

      {/* Analysis Overlay View */}
      {isAnalysisMode && (
        <AnalysisOverlay symbol={symbol}>
          <BaseChart {...chartProps} height={window.innerHeight - 60} symbol={symbol} />
        </AnalysisOverlay>
      )}
    </div>
  );
}
