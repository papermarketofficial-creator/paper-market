import { JournalEntry } from '@/types/journal.types';
import { analyzeBehavior, BehaviorType } from '@/lib/behavior-analytics';

// --- Types ---

export interface WeeklySummary {
  id: string;              // Format: "YYYY-W##"
  startDate: Date;         // Monday of the week
  endDate: Date;           // Sunday of the week
  totalTrades: number;
  netPnL: number;
  winRate: number;
  
  // Behavior Metrics
  behaviorCounts: Record<BehaviorType, number>;
  dominantBehavior: BehaviorType | null;
  insightCount: number;
  
  // Generated Text
  note: string;
}

// --- Helpers ---

/**
 * Returns the ISO week ID (e.g., "2025-W01") and the Monday date
 */
function getWeekInfo(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);

  // Calculate Week Number
  const yearStart = new Date(monday.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((monday.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  
  return {
    id: `${monday.getFullYear()}-W${weekNo.toString().padStart(2, '0')}`,
    startDate: monday
  };
}

/**
 * Formats currency for the summary note
 */
const formatMoney = (val: number) => 
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

// --- Core Logic ---

export function generateWeeklySummaries(entries: JournalEntry[]): WeeklySummary[] {
  if (entries.length === 0) return [];

  // 1. Analyze Behavior Globally (to capture streaks crossing week boundaries)
  const allInsights = analyzeBehavior(entries);

  // 2. Group Data by Week
  const weeksMap = new Map<string, {
    trades: JournalEntry[];
    insights: typeof allInsights;
    startDate: Date;
  }>();

  // Bucket Trades
  entries.forEach(entry => {
    if (!entry.exitTime) return; // Ignore open trades for weekly summary
    const { id, startDate } = getWeekInfo(entry.exitTime);
    
    if (!weeksMap.has(id)) {
      weeksMap.set(id, { trades: [], insights: [], startDate });
    }
    weeksMap.get(id)!.trades.push(entry);
  });

  // Bucket Insights (based on timestamp)
  allInsights.forEach(insight => {
    const { id, startDate } = getWeekInfo(insight.timestamp);
    if (!weeksMap.has(id)) {
      // Edge case: Insight generated but no closed trades that week? (Rare but possible)
      weeksMap.set(id, { trades: [], insights: [], startDate });
    }
    weeksMap.get(id)!.insights.push(insight);
  });

  // 3. Process Each Week
  const summaries: WeeklySummary[] = [];

  weeksMap.forEach((data, weekId) => {
    const { trades, insights, startDate } = data;
    
    // Basic Metrics
    const totalTrades = trades.length;
    const netPnL = trades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
    const wins = trades.filter(t => (t.realizedPnL || 0) > 0).length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    // Behavior Metrics
    const behaviorCounts: Record<string, number> = {};
    let maxCount = 0;
    let dominant: BehaviorType | null = null;

    // ✅ FIX: Use for...of instead of forEach
    for (const i of insights) {
      behaviorCounts[i.type] = (behaviorCounts[i.type] || 0) + 1;
      if (behaviorCounts[i.type] > maxCount) {
        maxCount = behaviorCounts[i.type];
        dominant = i.type;
      }
    }

    // Generate Factual Note
    // Now TypeScript knows 'dominant' can be a string
    const behaviorNote = dominant 
      ? `Primary behavioral pattern was ${dominant.replace(/_/g, ' ').toLowerCase()} (${maxCount} instances).` 
      : "No significant behavioral anomalies detected.";

    const note = `Week closed with ${totalTrades} trades and Net P&L of ${formatMoney(netPnL)}. ${behaviorNote}`;

    // Calculate End Date (Sunday)
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    summaries.push({
      id: weekId,
      startDate,
      endDate,
      totalTrades,
      netPnL,
      winRate,
      behaviorCounts: behaviorCounts as Record<BehaviorType, number>,
      dominantBehavior: dominant,
      insightCount: insights.length,
      note
    });
  });

  // Sort by date descending (newest week first)
  return summaries.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
}
