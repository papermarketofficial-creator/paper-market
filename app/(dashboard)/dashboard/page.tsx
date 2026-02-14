"use client";
import dynamic from 'next/dynamic';
import { Suspense, useMemo } from 'react';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentTradesTable } from '@/components/dashboard/RecentTradesTable';
import { useDashboardOverview } from '@/hooks/queries/use-dashboard-overview';
import { useMarketStore } from '@/stores/trading/market.store';
import { toInstrumentKey } from '@/lib/market/symbol-normalization';
import { Wallet, TrendingUp, Briefcase, Target, TrendingDown, BarChart3, Award } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const EquityChart = dynamic(() => import('@/components/dashboard/EquityChart').then(mod => ({ default: mod.EquityChart })), { ssr: false });

const DashboardPage = () => {
  const { data: overview, isLoading, isError, error } = useDashboardOverview();
  const quotesByInstrument = useMarketStore((state) => state.quotesByInstrument);
  const selectQuote = useMarketStore((state) => state.selectQuote);

  const staleThresholdSec = overview?.freshness.staleThresholdSec ?? 20;

  const liveState = useMemo(() => {
    if (!overview) {
      return {
        openPnL: 0,
        totalPnL: 0,
        stale: false,
        staleCount: 0,
        unknownCount: 0,
      };
    }

    let openPnL = 0;
    let staleCount = 0;
    let unknownCount = 0;
    const nowMs = Date.now();

    for (const position of overview.positions) {
      const key = toInstrumentKey(position.instrumentKey || position.symbol);
      const quote =
        quotesByInstrument[key] ||
        selectQuote(key) ||
        selectQuote(position.symbol);

      const quotePrice = Number(quote?.price);
      const hasLiveQuote = Number.isFinite(quotePrice) && quotePrice > 0;

      const fallbackPrice = Number(position.lastKnownPrice);
      const hasFallback = Number.isFinite(fallbackPrice) && fallbackPrice > 0;

      if (!hasLiveQuote && !hasFallback) {
        unknownCount += 1;
        staleCount += 1;
        continue;
      }

      const activePrice = hasLiveQuote ? quotePrice : fallbackPrice;
      const delta =
        position.side === "BUY"
          ? activePrice - position.entryPrice
          : position.entryPrice - activePrice;
      openPnL += delta * position.quantity;

      const updatedAtMs = hasLiveQuote
        ? Number.isFinite(Number(quote?.timestamp))
          ? Number(quote?.timestamp)
          : nowMs
        : position.lastKnownPriceAt
          ? new Date(position.lastKnownPriceAt).getTime()
          : null;

      if (
        updatedAtMs === null ||
        !Number.isFinite(updatedAtMs) ||
        nowMs - updatedAtMs > staleThresholdSec * 1000
      ) {
        staleCount += 1;
      }
    }

    const totalPnL = openPnL + overview.orders.closedPnL;
    return {
      openPnL,
      totalPnL,
      stale: staleCount > 0 || overview.freshness.stale,
      staleCount: Math.max(staleCount, overview.freshness.staleCount),
      unknownCount,
    };
  }, [overview, quotesByInstrument, selectQuote, staleThresholdSec]);

  const recentTrades = useMemo(
    () =>
      (overview?.orders.recent || []).map((order) => ({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        pnl: order.realizedPnL,
        status: order.status,
      })),
    [overview]
  );

  const availableBalance = overview?.wallet.availableBalance ?? 0;
  const winRate = overview?.metrics.winRate ?? 0;
  const maxDrawdown = overview?.metrics.maxDrawdownPct ?? 0;
  const sharpeRatio = overview?.metrics.sharpeRatio ?? 0;
  const dailyPnL = overview?.metrics.dailyPnL ?? 0;
  const bestTrade = overview?.metrics.bestTrade ?? 0;
  const positionCount = overview?.positions.length ?? 0;
  const winningTrades = overview?.orders.winningTradeCount ?? 0;
  const closedTradeCount = overview?.orders.closedTradeCount ?? 0;

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

      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Failed to load dashboard data: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {overview && liveState.stale && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-300">
          Live prices are stale for {liveState.staleCount} symbol(s). Showing last known values where available.
        </div>
      )}

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
          value={`${liveState.totalPnL >= 0 ? '+' : ''}${formatCurrency(liveState.totalPnL)}`}
          icon={TrendingUp}
          trend={liveState.totalPnL >= 0 ? 'up' : 'down'}
          subtitle={liveState.stale ? 'Open + Closed (stale)' : 'Open + Closed'}
        />
        <StatCard
          title="Open Positions"
          value={positionCount.toString()}
          icon={Briefcase}
          trend="neutral"
          subtitle="Active trades"
        />
        <StatCard
          title="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          icon={Target}
          trend={winRate >= 50 ? 'up' : winRate > 0 ? 'down' : 'neutral'}
          subtitle={`${winningTrades}/${closedTradeCount} trades`}
        />
        <StatCard
          title="Max Drawdown"
          value={maxDrawdown > 0 ? `-${maxDrawdown.toFixed(2)}%` : '0.00%'}
          icon={TrendingDown}
          trend="down"
          subtitle="Worst loss streak"
        />
        <StatCard
          title="Sharpe Ratio"
          value={sharpeRatio.toFixed(2)}
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
          <EquityChart data={overview?.equityCurve || []} loading={isLoading} />
        </Suspense>
        <RecentTradesTable trades={recentTrades} loading={isLoading} />
      </div>
    </div>
  );
};

export default DashboardPage;
