export interface DashboardWallet {
  balance: number;
  blockedBalance: number;
  availableBalance: number;
  currency: "INR";
}

export interface DashboardPosition {
  id: string;
  symbol: string;
  instrumentKey?: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  lastKnownPrice: number | null;
  lastKnownPriceAt: string | null;
}

export interface DashboardRecentOrder {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  status: string;
  realizedPnL: number | null;
  executedAt: string | null;
  createdAt: string;
}

export interface DashboardOrderSummary {
  recent: DashboardRecentOrder[];
  closedTradeCount: number;
  winningTradeCount: number;
  closedPnL: number;
}

export interface DashboardMetrics {
  openPnLFromLastKnown: number;
  totalPnLFromLastKnown: number;
  winRate: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  dailyPnL: number;
  bestTrade: number;
}

export interface DashboardEquityPoint {
  time: number;
  value: number;
}

export interface DashboardFreshness {
  stale: boolean;
  staleCount: number;
  staleThresholdSec: number;
}

export interface DashboardOverviewData {
  asOf: string;
  wallet: DashboardWallet;
  positions: DashboardPosition[];
  orders: DashboardOrderSummary;
  metrics: DashboardMetrics;
  equityCurve: DashboardEquityPoint[];
  freshness: DashboardFreshness;
}

export interface DashboardOverviewResponse {
  success: true;
  data: DashboardOverviewData;
}
