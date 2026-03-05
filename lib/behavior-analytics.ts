import { JournalEntry } from '@/types/journal.types';

// --- Types ---

export type BehaviorType = 
  | 'HIGH_FREQUENCY'      // Potential overtrading
  | 'RAPID_REENTRY'       // Potential revenge trading
  | 'LOSS_STREAK'         // Potential tilt
  | 'LONG_HOLD_LOSS'      // "Bag holding"
  | 'SIZE_DEVIATION';     // Risk inconsistency

export type BehaviorSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface BehaviorInsight {
  type: BehaviorType;
  severity: BehaviorSeverity;
  tradeIds: string[];
  message: string;        // Neutral, factual description
  timestamp: Date;        // Time of occurrence
}

// --- Configuration Constants ---

const CONFIG = {
  RAPID_REENTRY_MINUTES: 5,
  HIGH_FREQ_WINDOW_MINUTES: 60,
  HIGH_FREQ_COUNT: 5,
  LOSS_STREAK_THRESHOLD: 3,
  HOLD_DURATION_MULTIPLIER: 2.5, // Losers held 2.5x longer than winners
};

// --- Helpers ---

const getDuration = (entry: JournalEntry): number => {
  if (!entry.exitTime) return 0;
  return new Date(entry.exitTime).getTime() - new Date(entry.entryTime).getTime();
};

const getMinutesDiff = (d1: Date, d2: Date): number => {
  return Math.abs(new Date(d1).getTime() - new Date(d2).getTime()) / (1000 * 60);
};

// --- Detectors ---

/**
 * Detects High Frequency Trading (Potential Overtrading)
 * Logic: > X trades opened within Y minutes
 */
function detectHighFrequency(entries: JournalEntry[]): BehaviorInsight[] {
  const insights: BehaviorInsight[] = [];
  if (entries.length < CONFIG.HIGH_FREQ_COUNT) return insights;

  // Sort by entry time
  const sorted = [...entries].sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

  // Sliding window check
  for (let i = 0; i <= sorted.length - CONFIG.HIGH_FREQ_COUNT; i++) {
    const window = sorted.slice(i, i + CONFIG.HIGH_FREQ_COUNT);
    const first = window[0];
    const last = window[window.length - 1];
    
    const diff = getMinutesDiff(last.entryTime, first.entryTime);

    if (diff <= CONFIG.HIGH_FREQ_WINDOW_MINUTES) {
      insights.push({
        type: 'HIGH_FREQUENCY',
        severity: diff < 30 ? 'HIGH' : 'MEDIUM',
        tradeIds: window.map(e => e.id),
        message: `${window.length} trades executed within ${Math.round(diff)} minutes.`,
        timestamp: last.entryTime,
      });
      // Skip ahead to avoid duplicate overlap alerts for the same burst
      i += CONFIG.HIGH_FREQ_COUNT - 1; 
    }
  }
  return insights;
}

/**
 * Detects Rapid Re-entry After Loss (Potential Revenge Trading)
 * Logic: Opening a new trade < 5 mins after closing a losing trade
 */
function detectRapidReentry(entries: JournalEntry[]): BehaviorInsight[] {
  const insights: BehaviorInsight[] = [];
  // Filter for closed trades only
  const closed = entries.filter(e => e.exitTime && e.realizedPnL !== undefined)
    .sort((a, b) => new Date(a.exitTime!).getTime() - new Date(b.exitTime!).getTime());

  for (let i = 0; i < closed.length - 1; i++) {
    const current = closed[i];
    const next = closed[i + 1];

    // Check if current trade was a loss
    if ((current.realizedPnL || 0) < 0) {
      const diff = getMinutesDiff(next.entryTime, current.exitTime!);
      
      // Check if next trade opened very quickly
      if (diff <= CONFIG.RAPID_REENTRY_MINUTES) {
        // Severity check: Did position size increase?
        const sizeIncreased = next.quantity > current.quantity;
        
        insights.push({
          type: 'RAPID_REENTRY',
          severity: sizeIncreased ? 'HIGH' : 'MEDIUM',
          tradeIds: [current.id, next.id],
          message: `New trade opened ${Math.round(diff * 60)}s after a loss.${sizeIncreased ? ' Quantity increased.' : ''}`,
          timestamp: next.entryTime
        });
      }
    }
  }
  return insights;
}

/**
 * Detects Loss Streaks (Tilt Risk)
 * Logic: Consecutive losses > threshold
 */
function detectLossStreaks(entries: JournalEntry[]): BehaviorInsight[] {
  const insights: BehaviorInsight[] = [];
  const closed = entries.filter(e => e.realizedPnL !== undefined)
    .sort((a, b) => new Date(a.exitTime!).getTime() - new Date(b.exitTime!).getTime());

  let currentStreak: string[] = [];

  for (const trade of closed) {
    if ((trade.realizedPnL || 0) < 0) {
      currentStreak.push(trade.id);
    } else {
      if (currentStreak.length >= CONFIG.LOSS_STREAK_THRESHOLD) {
        insights.push({
          type: 'LOSS_STREAK',
          severity: currentStreak.length >= 5 ? 'HIGH' : 'MEDIUM',
          tradeIds: [...currentStreak],
          message: `Consecutive loss streak of ${currentStreak.length} trades.`,
          timestamp: trade.exitTime! // Logged at the moment the streak ended (or could be last loss)
        });
      }
      currentStreak = [];
    }
  }
  
  // Check open streak at the end
  if (currentStreak.length >= CONFIG.LOSS_STREAK_THRESHOLD) {
     const lastTrade = closed[closed.length-1];
     insights.push({
        type: 'LOSS_STREAK',
        severity: currentStreak.length >= 5 ? 'HIGH' : 'MEDIUM',
        tradeIds: [...currentStreak],
        message: `Active consecutive loss streak of ${currentStreak.length} trades.`,
        timestamp: lastTrade.exitTime!
      });
  }

  return insights;
}

/**
 * Detects Bag Holding
 * Logic: Average duration of losers is significantly higher than winners
 */
function detectHoldingLosers(entries: JournalEntry[]): BehaviorInsight[] {
  const insights: BehaviorInsight[] = [];
  const closed = entries.filter(e => e.exitTime && e.realizedPnL !== undefined);
  
  const winners = closed.filter(e => (e.realizedPnL || 0) > 0);
  const losers = closed.filter(e => (e.realizedPnL || 0) < 0);

  if (winners.length < 3 || losers.length < 3) return []; // Need sample size

  const avgWinDuration = winners.reduce((acc, t) => acc + getDuration(t), 0) / winners.length;
  
  // Check individual losers that deviate significantly
  losers.forEach(loser => {
    const duration = getDuration(loser);
    if (duration > avgWinDuration * CONFIG.HOLD_DURATION_MULTIPLIER) {
      insights.push({
        type: 'LONG_HOLD_LOSS',
        severity: duration > avgWinDuration * 4 ? 'HIGH' : 'MEDIUM',
        tradeIds: [loser.id],
        message: `Losing trade held ${(duration / avgWinDuration).toFixed(1)}x longer than average winning trade.`,
        timestamp: loser.exitTime!
      });
    }
  });

  return insights;
}

// --- Main Export ---

/**
 * Analyzes journal entries to detect behavioral patterns.
 * Pure function: does not modify inputs.
 */
export function analyzeBehavior(entries: JournalEntry[]): BehaviorInsight[] {
  if (!entries || entries.length === 0) return [];

  const insights = [
    ...detectHighFrequency(entries),
    ...detectRapidReentry(entries),
    ...detectLossStreaks(entries),
    ...detectHoldingLosers(entries),
  ];

  // Sort by most recent occurrence
  return insights.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}