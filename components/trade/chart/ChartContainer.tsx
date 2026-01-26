"use client";
import { useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { CandlestickData, HistogramData, Time } from 'lightweight-charts';
import { useAnalysisStore } from '@/stores/trading/analysis.store';
import { SMA, RSI, MACD, EMA, BollingerBands } from 'technicalindicators';
import { useMarketStore } from '@/stores/trading/market.store';

// Dynamic imports to avoid SSR issues with LWC
const BaseChart = dynamic(() => import('./BaseChart').then(mod => mod.BaseChart), { ssr: false });
const AnalysisOverlay = dynamic(() => import('../analysis/AnalysisOverlay').then(mod => mod.AnalysisOverlay), { ssr: false });

interface ChartContainerProps {
  symbol: string;
}

// Reuse the generation logic from previous file for now (Phase 1)


export function ChartContainer({ symbol }: ChartContainerProps) {
  const {
    isAnalysisMode,
    activeTool,
    getIndicators,
    getDrawings,
    timeframe // New
  } = useAnalysisStore();

  const {
    historicalData,
    volumeData,
    initializeSimulation,
    startSimulation,
    stopSimulation
  } = useMarketStore();

  const indicators = getIndicators(symbol);
  const drawings = getDrawings(symbol);

  // Use state from store
  const data = historicalData;
  const volData = volumeData;

  // 1. Data Fetching (Simulation)
  useEffect(() => {
    // Reset interaction on symbol change
    useAnalysisStore.getState().cancelDrawing();

    // Initialize Simulation
    initializeSimulation(symbol, timeframe);
    startSimulation();

    return () => {
      stopSimulation();
    }
  }, [symbol, timeframe, initializeSimulation, startSimulation, stopSimulation]); // Reload on timeframe change

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
        else if (ind.type === 'EMA') {
          const ema = EMA.calculate({ period, values: closes });
          results = ema.map((val, i) => {
            const dataIndex = i + period - 1;
            if (!data[dataIndex]) return null;
            return { time: data[dataIndex].time, value: val };
          }).filter(Boolean);
          return { config: ind, data: results };
        }
        else if (ind.type === 'BB') {
          const bb = BollingerBands.calculate({ period, stdDev: 2, values: closes });
          // BB returns { middle, upper, lower }
          // We need to map this to 3 series or similar. For simplicity, we'll return complex data and handle in BaseChart
          // Or simpler: just return Main Line (Middle) here? No, user wants Bands.
          // We'll structure it like MACD (series object)

          results = bb.map((val, i) => {
            const dataIndex = i + period - 1;
            if (!data[dataIndex]) return null;
            return {
              time: data[dataIndex].time,
              middle: val.middle,
              upper: val.upper,
              lower: val.lower
            };
          }).filter(Boolean);

          // Extract into separate arrays for lightweight-charts
          const middle = results.map((r: any) => ({ time: r.time, value: r.middle }));
          const upper = results.map((r: any) => ({ time: r.time, value: r.upper }));
          const lower = results.map((r: any) => ({ time: r.time, value: r.lower }));

          return {
            config: ind,
            data: middle, // Default to middle for generic renderers
            series: {
              middle,
              upper,
              lower
            }
          };
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
