"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useDashboardOverview } from '@/hooks/queries/use-dashboard-overview';
import { useMarketStore } from '@/stores/trading/market.store';
import { toInstrumentKey } from '@/lib/market/symbol-normalization';
import {
  ArrowUpRight,
  BookOpenText,
  CandlestickChart,
  ChartNoAxesCombined,
  ChevronRight,
  LayoutGrid,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

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

  const statTiles = [
    {
      title: "Available Balance",
      value: formatCurrency(availableBalance),
      subtitle: "Virtual funds",
      icon: Wallet,
      tone: "text-[#d8dee9]",
    },
    {
      title: "Total P&L",
      value: `${liveState.totalPnL >= 0 ? "+" : ""}${formatCurrency(liveState.totalPnL)}`,
      subtitle: liveState.stale ? "Open + Closed (stale)" : "Open + Closed",
      icon: TrendingUp,
      tone: liveState.totalPnL >= 0 ? "text-[#2dd4bf]" : "text-[#fb7185]",
    },
    {
      title: "Open Positions",
      value: positionCount.toString(),
      subtitle: "Active trades",
      icon: LayoutGrid,
      tone: "text-[#d8dee9]",
    },
    {
      title: "Win Rate",
      value: `${winRate.toFixed(1)}%`,
      subtitle: `${winningTrades}/${closedTradeCount} trades`,
      icon: Target,
      tone: winRate >= 50 ? "text-[#2dd4bf]" : "text-[#fbbf24]",
    },
  ] as const;

  const quickActions = [
    { label: "Equity", href: "/trade/equity", icon: CandlestickChart },
    { label: "Futures", href: "/trade/futures", icon: TrendingUp },
    { label: "Options", href: "/trade/options", icon: ShieldCheck },
    { label: "Journal", href: "/journal", icon: BookOpenText },
    { label: "Analytics", href: "/analytics", icon: ChartNoAxesCombined },
  ] as const;

  const recentOrders = (overview?.orders.recent || []).slice(0, 5);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-2 pb-20 pt-1 md:space-y-6 md:px-4 md:pb-6">
      {isError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          Failed to load dashboard data: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      <section className="rounded-2xl border border-white/[0.08] bg-[#0c1322] p-3 md:p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 md:text-base">Quick Access</h2>
          <span className="text-[11px] text-slate-500">Tap to open</span>
        </div>
        <div className="grid grid-cols-5 gap-2 md:gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group flex min-h-[74px] flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-[#111a2b] px-2 py-2 text-center transition hover:border-emerald-400/40 hover:bg-[#121f31]"
              >
                <Icon className="h-4 w-4 text-slate-300 transition group-hover:text-emerald-300 md:h-5 md:w-5" />
                <span className="mt-2 text-[11px] font-medium text-slate-300 md:text-xs">{action.label}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, idx) => (
              <div key={`sk-${idx}`} className="h-[112px] animate-pulse rounded-2xl border border-white/[0.08] bg-[#111827]" />
            ))
          : statTiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <div
                  key={tile.title}
                  className="rounded-2xl border border-white/[0.08] bg-[#0f1728] p-4 shadow-[0_10px_24px_rgba(0,0,0,0.24)]"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.08em] text-slate-400">{tile.title}</p>
                    <span className="rounded-lg border border-white/[0.08] bg-black/20 p-2">
                      <Icon className="h-4 w-4 text-slate-300" />
                    </span>
                  </div>
                  <p className={`text-xl font-semibold sm:text-2xl ${tile.tone}`}>{tile.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{tile.subtitle}</p>
                </div>
              );
            })}
      </section>

      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 md:gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0f1728] p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Risk</p>
          <p className="mt-2 text-xl font-semibold text-[#fb7185]">
            {maxDrawdown > 0 ? `-${maxDrawdown.toFixed(2)}%` : "0.00%"}
          </p>
          <p className="mt-1 text-xs text-slate-500">Max drawdown</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#0f1728] p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Quality</p>
          <p className="mt-2 text-xl font-semibold text-slate-100">{sharpeRatio.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-500">Sharpe ratio</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#0f1728] p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Best Trade</p>
          <p className="mt-2 text-xl font-semibold text-[#2dd4bf]">{formatCurrency(bestTrade)}</p>
          <p className="mt-1 text-xs text-slate-500">Highest realized profit</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#0f1728] p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Daily</p>
          <p className={`mt-2 text-xl font-semibold ${dailyPnL >= 0 ? "text-[#2dd4bf]" : "text-[#fb7185]"}`}>
            {dailyPnL >= 0 ? "+" : ""}
            {formatCurrency(dailyPnL)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Today's realized P&amp;L</p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0c1322] p-3 md:p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 md:text-base">Recent Orders</h2>
          <Link href="/orders" className="inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-slate-200">
            View all <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="space-y-2">
          {isLoading &&
            Array.from({ length: 4 }).map((_, idx) => (
              <div key={`ord-sk-${idx}`} className="h-14 animate-pulse rounded-xl border border-white/[0.08] bg-[#111827]" />
            ))}

          {!isLoading && recentOrders.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#0d1525] p-4 text-sm text-slate-400">
              No recent orders yet.
            </div>
          )}

          {!isLoading &&
            recentOrders.map((order) => {
              const pnl = Number(order.realizedPnL || 0);
              const pnlText = `${pnl >= 0 ? "+" : ""}${formatCurrency(pnl)}`;
              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#10192b] px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{order.symbol}</p>
                    <p className="text-xs text-slate-500">
                      {order.side} • Qty {order.quantity} • {order.status}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${pnl >= 0 ? "text-[#2dd4bf]" : "text-[#fb7185]"}`}>
                      {pnlText}
                    </p>
                    <p className="text-[11px] text-slate-500">Realized</p>
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        <Link
          href="/trade/equity"
          className="group rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#10253a] to-[#123845] p-4"
        >
          <p className="text-xs uppercase tracking-[0.08em] text-slate-300">Start Trading</p>
          <p className="mt-2 text-lg font-semibold text-slate-100">Open Equity Terminal</p>
          <p className="mt-1 text-xs text-slate-300/80">Jump into live paper execution.</p>
          <ArrowUpRight className="mt-3 h-4 w-4 text-emerald-200 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
        <Link
          href="/analytics"
          className="group rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#2a1f34] to-[#1b2438] p-4"
        >
          <p className="text-xs uppercase tracking-[0.08em] text-slate-300">Insights</p>
          <p className="mt-2 text-lg font-semibold text-slate-100">Review Performance</p>
          <p className="mt-1 text-xs text-slate-300/80">See trends, winners, and weak spots.</p>
          <TrendingDown className="mt-3 h-4 w-4 text-violet-200 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </section>
    </div>
  );
};

export default DashboardPage;
