"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePositionsStore } from "@/stores/trading/positions.store";
import { useTradeExecutionStore } from "@/stores/trading/tradeExecution.store";
import { useWalletStore } from "@/stores/wallet.store";
import { useMarketStore } from "@/stores/trading/market.store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}

function formatPnl(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${formatMoney(value)}`;
}

type PositionHealth = "Healthy" | "At Risk" | "Danger";

/**
 * Position Health Indicator
 * Computes how much of the theoretical max loss has been realized.
 * BUY options: maxLoss = entryPrice * |qty|
 * SELL options: use 3× premium as proxy (paper trading heuristic)
 */
function getPositionHealth(
  unrealizedPnl: number,
  entryPrice: number,
  qty: number,
  side: string
): { health: PositionHealth; pct: number } {
  const absQty = Math.abs(qty);
  const maxLoss = side === "BUY" ? entryPrice * absQty : entryPrice * absQty * 3;
  if (maxLoss <= 0) return { health: "Healthy", pct: 0 };

  const lossUsed = Math.max(0, -unrealizedPnl); // positive = actual loss
  const pct = (lossUsed / maxLoss) * 100;

  if (pct < 30) return { health: "Healthy", pct };
  if (pct < 70) return { health: "At Risk", pct };
  return { health: "Danger", pct };
}

const HEALTH_STYLES: Record<PositionHealth, { dot: string; badge: string }> = {
  Healthy: { dot: "bg-emerald-400", badge: "bg-emerald-500/10 text-emerald-400" },
  "At Risk": { dot: "bg-amber-400", badge: "bg-amber-500/10 text-amber-400" },
  Danger: { dot: "bg-rose-400 animate-pulse", badge: "bg-rose-500/10 text-rose-400" },
};

const HEALTH_EMOJI: Record<PositionHealth, string> = {
  Healthy: "🟢",
  "At Risk": "🟡",
  Danger: "🔴",
};

type PositionRow = {
  instrumentToken: string;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  underlying: string;
  optionType?: string | null;
  livePrice: number;
  unrealizedPnl: number;
  expiryLabel?: string | null;
  health: PositionHealth;
  healthPct: number;
};

export function PositionsOrdersSummary() {
  const positions = usePositionsStore((state) => state.positions);
  const fetchPositions = usePositionsStore((state) => state.fetchPositions);
  const pendingOrders = useTradeExecutionStore((state) => state.pendingOrders);
  const fetchOrders = useTradeExecutionStore((state) => state.fetchOrders);
  const executeTrade = useTradeExecutionStore((state) => state.executeTrade);
  const blockedBalance = useWalletStore((state) => state.blockedBalance);
  const balance = useWalletStore((state) => state.balance);
  const quotesByInstrument = useMarketStore((state) => state.quotesByInstrument);

  useEffect(() => {
    fetchPositions(true).catch(() => undefined);
    fetchOrders().catch(() => undefined);
  }, [fetchOrders, fetchPositions]);

  const positionRows = useMemo<PositionRow[]>(() => {
    return positions
      .filter((p) => Number(p.quantity || 0) !== 0)
      .map((p) => {
        const token = String(p.instrumentToken || "");
        const livePrice = Number(quotesByInstrument[token]?.price ?? 0) || Number(p.currentPrice ?? 0);
        const entryPrice = Number(p.entryPrice || 0);
        const qty = Number(p.quantity || 0);
        const unrealizedPnl =
          p.side === "BUY" ? (livePrice - entryPrice) * qty : (entryPrice - livePrice) * Math.abs(qty);

        const sym = String(p.symbol || "");
        const pAny = p as unknown as Record<string, unknown>;
        const underlying =
          String(pAny.underlying || "").toUpperCase() || sym.replace(/\d.*/, "").toUpperCase() || sym;

        let expiryLabel: string | null = null;
        const rawExpiry = p.expiryDate ?? (pAny.expiry as Date | string | undefined);
        if (rawExpiry) {
          try {
            const d = new Date(String(rawExpiry));
            if (!Number.isNaN(d.getTime())) {
              expiryLabel = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
            }
          } catch { /* ignore */ }
        }

        const { health, pct: healthPct } = getPositionHealth(unrealizedPnl, entryPrice, qty, p.side);

        return {
          instrumentToken: token,
          symbol: sym,
          side: String(p.side || ""),
          quantity: qty,
          entryPrice,
          underlying,
          optionType: String((pAny.optionType as string) || "").toUpperCase() || null,
          livePrice,
          unrealizedPnl,
          expiryLabel,
          health,
          healthPct,
        };
      });
  }, [positions, quotesByInstrument]);

  const groups = useMemo(() => {
    const map = new Map<string, PositionRow[]>();
    for (const row of positionRows) {
      const key = row.underlying || "OTHER";
      const existing = map.get(key) || [];
      existing.push(row);
      map.set(key, existing);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [positionRows]);

  const totalPnl = useMemo(() => positionRows.reduce((s, r) => s + r.unrealizedPnl, 0), [positionRows]);
  const dangerCount = positionRows.filter((r) => r.health === "Danger").length;

  const handleClose = useCallback(async (row: PositionRow) => {
    try {
      await executeTrade(
        { instrumentToken: row.instrumentToken, symbol: row.symbol, side: row.side === "BUY" ? "SELL" : "BUY", quantity: Math.abs(row.quantity), entryPrice: row.livePrice },
        1, "options"
      );
      toast.success("Position closed", { description: row.symbol });
      fetchPositions(true).catch(() => undefined);
    } catch (err) {
      toast.error("Close failed", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  }, [executeTrade, fetchPositions]);

  return (
    <section className="rounded-2xl bg-[linear-gradient(180deg,rgba(17,24,39,.75),rgba(8,12,22,.88))] p-3 shadow-[0_10px_35px_rgba(0,0,0,.28)]">

      {/* Danger zone alert */}
      {dangerCount > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/8 px-3 py-2 text-xs font-semibold text-rose-300">
          🔴 {dangerCount} position{dangerCount > 1 ? "s" : ""} in Danger Zone — close to max loss. Review immediately.
        </div>
      )}

      {/* Stats bar */}
      <div className="mb-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-5">
        <div><p className="text-slate-400">Open Positions</p><p className="mt-1 text-sm font-semibold text-white">{positionRows.length}</p></div>
        <div><p className="text-slate-400">Open Orders</p><p className="mt-1 text-sm font-semibold text-white">{pendingOrders.length}</p></div>
        <div><p className="text-slate-400">Blocked Margin</p><p className="mt-1 text-sm font-semibold tabular-nums text-white">{formatMoney(blockedBalance)}</p></div>
        <div><p className="text-slate-400">Balance</p><p className="mt-1 text-sm font-semibold tabular-nums text-white">{formatMoney(balance)}</p></div>
        <div>
          <p className="text-slate-400">Net P&L</p>
          <p className={cn("mt-1 text-sm font-semibold tabular-nums", totalPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {formatPnl(totalPnl)}
          </p>
        </div>
      </div>

      {/* Positions table */}
      {positionRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-slate-400">
                <th className="py-1.5 text-left font-medium">Symbol</th>
                <th className="py-1.5 text-center font-medium">Side</th>
                <th className="py-1.5 text-right font-medium">Qty</th>
                <th className="py-1.5 text-right font-medium">Avg</th>
                <th className="py-1.5 text-right font-medium">LTP</th>
                <th className="py-1.5 text-right font-medium">P&L</th>
                <th className="py-1.5 text-center font-medium">Health</th>
                <th className="py-1.5 text-center font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([underlying, rows]) => (
                <>
                  <tr key={`group-${underlying}`}>
                    <td colSpan={8} className="pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {underlying}
                    </td>
                  </tr>
                  {rows.map((row) => {
                    const pnlPositive = row.unrealizedPnl >= 0;
                    const { dot, badge } = HEALTH_STYLES[row.health];
                    return (
                      <tr key={row.instrumentToken} className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]">
                        <td className="py-1.5 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-100">{row.symbol}</span>
                            {row.optionType && (
                              <span className={cn("rounded px-1 py-0.5 text-[10px] font-semibold", row.optionType === "CE" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400")}>
                                {row.optionType}
                              </span>
                            )}
                            {row.expiryLabel && (
                              <span className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px] text-slate-400">{row.expiryLabel}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 text-center">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", row.side === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400")}>
                            {row.side}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-200">{Math.abs(row.quantity).toLocaleString("en-IN")}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-300">{row.entryPrice.toFixed(2)}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-200">{row.livePrice > 0 ? row.livePrice.toFixed(2) : "--"}</td>
                        <td className={cn("py-1.5 text-right tabular-nums font-semibold", pnlPositive ? "text-emerald-400" : "text-rose-400")}>
                          {formatPnl(row.unrealizedPnl)}
                        </td>
                        {/* ── Position Health Indicator ── */}
                        <td className="py-1.5 text-center">
                          <div className="group relative inline-flex items-center gap-1 cursor-default">
                            <div className={cn("h-2 w-2 rounded-full", dot)} />
                            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", badge)}>
                              {HEALTH_EMOJI[row.health]} {row.health}
                            </span>
                            {/* Tooltip showing % of max loss used */}
                            <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#1e293b] px-2 py-1 text-[10px] text-slate-300 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                              {row.healthPct.toFixed(0)}% of max loss used
                            </div>
                          </div>
                        </td>
                        <td className="py-1.5 text-center">
                          <button type="button" onClick={() => handleClose(row)}
                            className="rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-slate-300 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400">
                            Close
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {positionRows.length === 0 && (
        <p className="text-center text-xs text-slate-500">No open positions.</p>
      )}
    </section>
  );
}
