"use client";
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentTradesTable } from '@/components/dashboard/RecentTradesTable';
import { useRiskStore } from '@/stores/trading/risk.store';
import { useWalletStore } from '@/stores/wallet.store';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { useOrdersStore } from '@/stores/trading/orders.store';
import { dashboardMetrics } from '@/content/dashboard';
import { Wallet, TrendingUp, Briefcase, Target, TrendingDown, BarChart3, Award } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const EquityChart = dynamic(() => import('@/components/dashboard/EquityChart').then(mod => ({ default: mod.EquityChart })), { ssr: false });

const DashboardPage = () => {
  const { availableBalance } = useWalletStore();
  const positions = usePositionsStore((state) => state.positions);
  const trades = useOrdersStore((state) => state.trades);
  const equityHistory = useRiskStore((state) => state.equityHistory);

  const totalPnL = positions.reduce((acc, pos) => {
    const pnl = pos.side === 'BUY'
      ? (pos.currentPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - pos.currentPrice) * pos.quantity;
    return acc + pnl;
  }, 0);

  const closedPnL = trades.reduce((acc, trade) => acc + (trade.pnl || 0), 0);
  const winningTrades = trades.filter((t) => (t.pnl || 0) > 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

  // Calculate additional metrics
  const { maxDrawdown, sharpeRatio, dailyPnL } = dashboardMetrics;
  const bestTrade = Math.max(...trades.map(t => t.pnl || 0), 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-4 sm:space-y-6 overflow-hidden">
      {/* Page Header */}
      <div className="px-1">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Welcome back! Here's your trading overview.</p>
      </div>

      {/* Stat Cards - Responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
        <StatCard
          title="Available Balance"
          value={formatCurrency(availableBalance)}
          icon={Wallet}
          subtitle="Virtual funds"
        />
        <StatCard
          title="Total P&L"
          value={`${totalPnL + closedPnL >= 0 ? '+' : ''}${formatCurrency(totalPnL + closedPnL)}`}
          icon={TrendingUp}
          trend={totalPnL + closedPnL >= 0 ? 'up' : 'down'}
          subtitle="Open + Closed"
        />
        <StatCard
          title="Open Positions"
          value={positions.length.toString()}
          icon={Briefcase}
          trend="neutral"
          subtitle="Active trades"
        />
        <StatCard
          title="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          icon={Target}
          trend={winRate >= 50 ? 'up' : winRate > 0 ? 'down' : 'neutral'}
          subtitle={`${winningTrades}/${trades.length} trades`}
        />
        <StatCard
          title="Max Drawdown"
          value={`${maxDrawdown}%`}
          icon={TrendingDown}
          trend="down"
          subtitle="Worst loss streak"
        />
        <StatCard
          title="Sharpe Ratio"
          value={sharpeRatio.toString()}
          icon={BarChart3}
          trend={sharpeRatio > 1 ? 'up' : 'neutral'}
          subtitle="Risk-adjusted return"
        />
        <StatCard
          title="Daily P&L"
          value={`${dailyPnL >= 0 ? '+' : ''}${formatCurrency(dailyPnL)}`}
          icon={TrendingUp}
          trend={dailyPnL >= 0 ? 'up' : 'down'}
          subtitle="Today's performance"
        />
        <StatCard
          title="Best Trade"
          value={formatCurrency(bestTrade)}
          icon={Award}
          trend="up"
          subtitle="Highest profit"
        />
      </div>

      {/* Charts and Tables - Stack on mobile, side-by-side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
          <EquityChart data={equityHistory} />
        </Suspense>
        <RecentTradesTable trades={trades} />
      </div>
    </div>
  );
};

export default DashboardPage;
