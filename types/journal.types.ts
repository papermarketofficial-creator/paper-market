import { InstrumentMode, Side } from './general.types';

export type ExitReason = 'MANUAL' | 'EXPIRY';

/**
 * Snapshot of risk metrics calculated at the moment of entry.
 * Essential for reviewing if the initial trade plan was followed.
 */
export interface RiskSnapshot {
  maxLoss: number;       // Theoretical max loss (Infinity if unlimited)
  maxProfit: number;     // Theoretical max profit (Infinity if unlimited)
  breakeven: number;     // Price point where P&L is 0
  capitalAtRisk: number; // Actual capital deployed/blocked
}

/**
 * Comprehensive data model for a single trade journal entry.
 * Captures the full lifecycle of the trade for analysis.
 */
export interface JournalEntry {
  id: string;
  instrument: InstrumentMode;
  symbol: string;
  expiryDate?: Date;
  side: Side;
  quantity: number;
  entryPrice: number;
  entryTime: Date;

  riskSnapshot?: RiskSnapshot;


  exitPrice?: number;
  exitTime?: Date;
  realizedPnL?: number;
  exitReason?: ExitReason;
  notes?: string;
}