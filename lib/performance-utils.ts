import { JournalEntry } from '@/types/journal.types';

export interface PerformanceMetrics {
  totalTrades: number;
  winRate: number;      // Percentage (0-100)
  averageWin: number;   // Currency
  averageLoss: number;  // Currency
  expectancy: number;   // Currency per trade
  profitFactor: number; // Ratio
  maxDrawdown: number;  // Currency value
  netPnL: number;       // Total Realized P&L
}

/**
 * Core utility to generate a full performance report from raw journal data.
 * Automatically filters out OPEN trades.
 */
export function calculatePerformanceMetrics(entries: JournalEntry[]): PerformanceMetrics {
  // 1. Filter for Closed Trades only (where P&L is realized)
  const closedTrades = entries.filter(
    (e) => e.realizedPnL !== undefined && e.exitTime !== undefined
  );

  const totalTrades = closedTrades.length;

  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      averageWin: 0,
      averageLoss: 0,
      expectancy: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      netPnL: 0,
    };
  }

  // 2. Sort by exit time to ensure correct Equity Curve / Drawdown calculation
  // (Defensive copy with slice() to remain pure)
  const sortedTrades = closedTrades.slice().sort((a, b) => {
    const timeA = new Date(a.exitTime!).getTime();
    const timeB = new Date(b.exitTime!).getTime();
    return timeA - timeB;
  });

  let winningTrades = 0;
  let totalWinPnL = 0;
  let totalLossPnL = 0;
  let netPnL = 0;

  // Variables for Drawdown Calculation
  let currentEquity = 0; // Relative equity curve starting at 0
  let peakEquity = 0;
  let maxDrawdown = 0;

  for (const trade of sortedTrades) {
    const pnl = trade.realizedPnL!;
    
    // Win/Loss Stats
    if (pnl > 0) {
      winningTrades++;
      totalWinPnL += pnl;
    } else {
      // Losses are summed up (keeping negative sign for net calculation, absolute for averages)
      totalLossPnL += Math.abs(pnl); 
    }

    // Net PnL
    netPnL += pnl;

    // Drawdown Logic
    currentEquity += pnl;
    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }
    const currentDrawdown = peakEquity - currentEquity;
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }
  }

  const losingTrades = totalTrades - winningTrades;

  // 3. Derived Metrics
  const winRate = (winningTrades / totalTrades) * 100;
  const averageWin = winningTrades > 0 ? totalWinPnL / winningTrades : 0;
  const averageLoss = losingTrades > 0 ? totalLossPnL / losingTrades : 0;
  
  // Profit Factor = Gross Profit / Gross Loss
  // Returns Infinity if no losses, 0 if no wins
  const profitFactor = totalLossPnL === 0 
    ? (totalWinPnL > 0 ? Infinity : 0) 
    : totalWinPnL / totalLossPnL;

  // Expectancy = (Win% * AvgWin) - (Loss% * AvgLoss)
  // Or simply: Net PnL / Total Trades
  const expectancy = netPnL / totalTrades;

  return {
    totalTrades,
    winRate: parseFloat(winRate.toFixed(2)),
    averageWin: parseFloat(averageWin.toFixed(2)),
    averageLoss: parseFloat(averageLoss.toFixed(2)), // Returned as positive value usually
    expectancy: parseFloat(expectancy.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    netPnL: parseFloat(netPnL.toFixed(2)),
  };
}