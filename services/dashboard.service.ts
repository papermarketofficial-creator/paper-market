import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { instruments, orders, positions, transactions } from "@/lib/db/schema";
import {
  calculateAnnualizedSharpeRatioFromEquityCurve,
  calculateMaxDrawdownPct,
  getIstDayBoundsUtc,
  roundTo,
} from "@/lib/dashboard-metrics";
import type { DashboardOverviewData, DashboardPosition } from "@/types/dashboard.types";
import { WalletService } from "@/services/wallet.service";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { logger } from "@/lib/logger";

const STALE_THRESHOLD_SEC = 20;

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOrderSide(value: unknown): value is "BUY" | "SELL" {
  return value === "BUY" || value === "SELL";
}

export class DashboardService {
  static async getOverview(userId: string): Promise<DashboardOverviewData> {
    const asOf = new Date();

    const wallet = await WalletService.getWallet(userId);
    const walletBalance = toFiniteNumber(wallet.balance);
    const blockedBalance = toFiniteNumber(wallet.blockedBalance);
    const availableBalance = walletBalance - blockedBalance;

    const positionRows = await db
      .select({
        id: positions.id,
        symbol: positions.symbol,
        quantity: positions.quantity,
        averagePrice: positions.averagePrice,
        instrumentToken: positions.instrumentToken,
      })
      .from(positions)
      .leftJoin(instruments, eq(positions.instrumentToken, instruments.instrumentToken))
      .where(eq(positions.userId, userId));

    await realTimeMarketService.initialize();

    const warmSymbols = Array.from(
      new Set(
        positionRows
          .map((row) => row.instrumentToken)
          .filter(Boolean)
          .map((value) => String(value))
      )
    );
    if (warmSymbols.length > 0) {
      await realTimeMarketService.warmSnapshotForSymbols(warmSymbols);
    }

    let staleCount = 0;
    const nowMs = asOf.getTime();

    const mappedPositions: DashboardPosition[] = positionRows.map((row) => {
      const quantity = Math.abs(Number(row.quantity) || 0);
      const side: "BUY" | "SELL" = Number(row.quantity) < 0 ? "SELL" : "BUY";
      const instrumentKey = row.instrumentToken || undefined;
      const quote = instrumentKey ? realTimeMarketService.getQuote(instrumentKey) : null;

      const quotedPrice = quote?.price;
      const lastKnownPrice =
        Number.isFinite(quotedPrice) && Number(quotedPrice) > 0 ? Number(quotedPrice) : null;
      const lastKnownPriceAt =
        quote?.lastUpdated instanceof Date ? quote.lastUpdated.toISOString() : null;

      const lastKnownMs = lastKnownPriceAt ? new Date(lastKnownPriceAt).getTime() : null;
      const isStale =
        lastKnownMs === null || !Number.isFinite(lastKnownMs) || nowMs - lastKnownMs > STALE_THRESHOLD_SEC * 1000;
      if (isStale) staleCount += 1;

      return {
        id: row.id,
        symbol: row.symbol,
        instrumentKey,
        side,
        quantity,
        entryPrice: toFiniteNumber(row.averagePrice),
        lastKnownPrice,
        lastKnownPriceAt,
      };
    });

    const openPnLFromLastKnown = mappedPositions.reduce((acc, position) => {
      if (position.lastKnownPrice === null) return acc;

      const delta =
        position.side === "BUY"
          ? position.lastKnownPrice - position.entryPrice
          : position.entryPrice - position.lastKnownPrice;
      return acc + delta * position.quantity;
    }, 0);

    const recentOrdersRows = await db
      .select({
        id: orders.id,
        symbol: orders.symbol,
        side: orders.side,
        quantity: orders.quantity,
        status: orders.status,
        realizedPnL: orders.realizedPnL,
        executedAt: orders.executedAt,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(20);

    const recentOrders = recentOrdersRows.map((order) => ({
      id: order.id,
      symbol: order.symbol,
      side: isOrderSide(order.side) ? order.side : "BUY",
      quantity: Number(order.quantity) || 0,
      status: String(order.status || "OPEN"),
      realizedPnL: toNullableNumber(order.realizedPnL),
      executedAt: order.executedAt ? new Date(order.executedAt).toISOString() : null,
      createdAt: order.createdAt
        ? new Date(order.createdAt).toISOString()
        : new Date().toISOString(),
    }));

    const closedOrderRows = await db
      .select({
        realizedPnL: orders.realizedPnL,
        executedAt: orders.executedAt,
        updatedAt: orders.updatedAt,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(and(eq(orders.userId, userId), isNotNull(orders.realizedPnL)));

    const closedPnLValues = closedOrderRows
      .map((row) => toNullableNumber(row.realizedPnL))
      .filter((value): value is number => value !== null);

    const closedTradeCount = closedPnLValues.length;
    const winningTradeCount = closedPnLValues.filter((value) => value > 0).length;
    const closedPnL = closedPnLValues.reduce((acc, value) => acc + value, 0);
    const bestTrade = closedPnLValues.length > 0 ? Math.max(...closedPnLValues, 0) : 0;

    const { start: dayStartUtc, end: dayEndUtc } = getIstDayBoundsUtc(asOf);
    const dayStartMs = dayStartUtc.getTime();
    const dayEndMs = dayEndUtc.getTime();

    const dailyPnL = closedOrderRows.reduce((acc, row) => {
      const pnl = toNullableNumber(row.realizedPnL);
      if (pnl === null) return acc;

      const stamp =
        row.executedAt instanceof Date
          ? row.executedAt
          : row.updatedAt instanceof Date
            ? row.updatedAt
            : row.createdAt instanceof Date
              ? row.createdAt
              : null;

      if (!stamp) return acc;
      const stampMs = stamp.getTime();
      if (stampMs >= dayStartMs && stampMs < dayEndMs) {
        return acc + pnl;
      }
      return acc;
    }, 0);

    const equityRows = await db
      .select({
        createdAt: transactions.createdAt,
        balanceAfter: transactions.balanceAfter,
      })
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(transactions.createdAt);

    const equityCurve =
      equityRows.length > 0
        ? equityRows.map((row) => ({
            time:
              row.createdAt instanceof Date
                ? row.createdAt.getTime()
                : asOf.getTime(),
            value: toFiniteNumber(row.balanceAfter),
          }))
        : [{ time: asOf.getTime(), value: walletBalance }];

    const maxDrawdownPct = calculateMaxDrawdownPct(equityCurve);
    const sharpeRatio = calculateAnnualizedSharpeRatioFromEquityCurve(equityCurve);
    const winRate = closedTradeCount > 0 ? (winningTradeCount / closedTradeCount) * 100 : 0;
    const totalPnLFromLastKnown = openPnLFromLastKnown + closedPnL;

    const freshness = {
      stale: staleCount > 0,
      staleCount,
      staleThresholdSec: STALE_THRESHOLD_SEC,
    };

    logger.debug(
      {
        userId,
        positions: mappedPositions.length,
        closedTradeCount,
        staleCount,
      },
      "Dashboard overview generated"
    );

    return {
      asOf: asOf.toISOString(),
      wallet: {
        balance: roundTo(walletBalance),
        blockedBalance: roundTo(blockedBalance),
        availableBalance: roundTo(availableBalance),
        currency: "INR",
      },
      positions: mappedPositions,
      orders: {
        recent: recentOrders,
        closedTradeCount,
        winningTradeCount,
        closedPnL: roundTo(closedPnL),
      },
      metrics: {
        openPnLFromLastKnown: roundTo(openPnLFromLastKnown),
        totalPnLFromLastKnown: roundTo(totalPnLFromLastKnown),
        winRate: roundTo(winRate),
        maxDrawdownPct: roundTo(maxDrawdownPct),
        sharpeRatio: roundTo(sharpeRatio),
        dailyPnL: roundTo(dailyPnL),
        bestTrade: roundTo(bestTrade),
      },
      equityCurve,
      freshness,
    };
  }
}
