"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePositionsStore } from "@/stores/trading/positions.store";
import { useTradeExecutionStore } from "@/stores/trading/tradeExecution.store";
import { useWalletStore } from "@/stores/wallet.store";
import { useMarketStore } from "@/stores/trading/market.store";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";

function fmtMoney(v: number): string {
  if (!Number.isFinite(v)) return "--";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtPnl(v: number): string {
  if (!Number.isFinite(v)) return "--";
  return `${v >= 0 ? "+" : ""}${fmtMoney(v)}`;
}

type PositionRow = {
  instrumentToken: string;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  livePrice: number;
  unrealizedPnl: number;
  optionType: string | null;
};

/**
 * Professional collapsible bottom bar — Zerodha style.
 * Shows summary stats always visible, expands to full positions/orders table.
 */
export function BottomBar() {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"positions" | "orders">("positions");

  const positions = usePositionsStore((s) => s.positions);
  const fetchPositions = usePositionsStore((s) => s.fetchPositions);
  const pendingOrders = useTradeExecutionStore((s) => s.pendingOrders);
  const fetchOrders = useTradeExecutionStore((s) => s.fetchOrders);
  const executeTrade = useTradeExecutionStore((s) => s.executeTrade);
  const blockedBalance = useWalletStore((s) => s.blockedBalance);
  const balance = useWalletStore((s) => s.availableBalance);
  const quotes = useMarketStore((s) => s.quotesByInstrument);

  useEffect(() => {
    fetchPositions(true).catch(() => undefined);
    fetchOrders().catch(() => undefined);
  }, [fetchOrders, fetchPositions]);

  const positionRows = useMemo<PositionRow[]>(() => {
    return positions
      .filter((p) => Number(p.quantity || 0) !== 0)
      .map((p) => {
        const token = String(p.instrumentToken || "");
        const livePrice = Number(quotes[token]?.price ?? 0) || Number(p.currentPrice ?? 0);
        const entryPrice = Number(p.entryPrice || 0);
        const qty = Number(p.quantity || 0);
        const unrealizedPnl =
          p.side === "BUY"
            ? (livePrice - entryPrice) * qty
            : (entryPrice - livePrice) * Math.abs(qty);
        const pAny = p as unknown as Record<string, unknown>;
        const optionType = String((pAny.optionType as string) || "").toUpperCase() || null;
        return {
          instrumentToken: token,
          symbol: String(p.symbol || ""),
          side: String(p.side || ""),
          quantity: qty,
          entryPrice,
          livePrice,
          unrealizedPnl,
          optionType: optionType || null,
        };
      });
  }, [positions, quotes]);

  const totalPnl = useMemo(
    () => positionRows.reduce((s, r) => s + r.unrealizedPnl, 0),
    [positionRows]
  );

  const handleClose = useCallback(
    async (row: PositionRow) => {
      try {
        await executeTrade(
          {
            instrumentToken: row.instrumentToken,
            symbol: row.symbol,
            side: row.side === "BUY" ? "SELL" : "BUY",
            quantity: Math.abs(row.quantity),
            entryPrice: row.livePrice,
          },
          1,
          "options"
        );
        toast.success("Position closed", { description: row.symbol });
        fetchPositions(true).catch(() => undefined);
      } catch (err) {
        toast.error("Close failed", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
    [executeTrade, fetchPositions]
  );

  const pnlPositive = totalPnl >= 0;

  return (
    <div className={cn("bg-card transition-all duration-300", expanded ? "max-h-[40vh]" : "")}>
      {/* ── Stats bar (always visible) ── */}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-center gap-6 px-4 py-2 text-left transition-colors hover:bg-muted/50"
      >
        {/* Tab headers */}
        <div className="flex items-center gap-4">
          <div
            className="flex items-center gap-2 text-xs"
            onClick={(e) => { e.stopPropagation(); setExpanded(true); setActiveTab("positions"); }}
          >
            <span className="text-muted-foreground">Positions</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                positionRows.length > 0 ? "bg-primary/15 text-primary" : "bg-muted/70 text-muted-foreground"
              )}
            >
              {positionRows.length}
            </span>
          </div>
          <div
            className="flex items-center gap-2 text-xs"
            onClick={(e) => { e.stopPropagation(); setExpanded(true); setActiveTab("orders"); }}
          >
            <span className="text-muted-foreground">Orders</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                pendingOrders.length > 0 ? "bg-amber-500/20 text-amber-400" : "bg-muted/70 text-muted-foreground"
              )}
            >
              {pendingOrders.length}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="ml-auto flex items-center gap-6">
          <div className="hidden items-center gap-1.5 text-xs sm:flex">
            <span className="text-muted-foreground">Margin</span>
            <span className="font-semibold tabular-nums text-foreground">{fmtMoney(blockedBalance)}</span>
          </div>
          <div className="hidden items-center gap-1.5 text-xs sm:flex">
            <span className="text-muted-foreground">Balance</span>
            <span className="font-semibold tabular-nums text-foreground">{fmtMoney(balance)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">P&L</span>
            <span
              className={cn(
                "font-bold tabular-nums",
                pnlPositive ? "text-emerald-400" : "text-rose-400"
              )}
            >
              {fmtPnl(totalPnl)}
            </span>
          </div>

          <span className="text-muted-foreground">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </span>
        </div>
      </button>

      {/* ── Expandable panel ── */}
      {expanded && (
        <div className="border-t border-border">
          {/* Tabs */}
          <div className="flex border-b border-border">
            {(["positions", "orders"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-1.5 text-xs font-semibold capitalize transition-colors",
                  activeTab === tab
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="max-h-[30vh] overflow-auto [scrollbar-width:thin]">
            {activeTab === "positions" && (
              positionRows.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No open positions</p>
              ) : (
                <table className="w-full min-w-[700px] text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-[11px] text-muted-foreground">
                      <th className="px-4 py-2 text-left font-medium">Symbol</th>
                      <th className="px-2 py-2 text-center font-medium">Side</th>
                      <th className="px-2 py-2 text-right font-medium">Qty</th>
                      <th className="px-2 py-2 text-right font-medium">Avg</th>
                      <th className="px-2 py-2 text-right font-medium">LTP</th>
                      <th className="px-2 py-2 text-right font-medium">P&L</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positionRows.map((row) => (
                      <tr
                        key={row.instrumentToken}
                        className="border-b border-border transition-colors hover:bg-muted/50"
                      >
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">{row.symbol}</span>
                            {row.optionType && (
                              <span
                                className={cn(
                                  "rounded px-1 py-0.5 text-[10px] font-bold",
                                  row.optionType === "CE"
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : "bg-rose-500/15 text-rose-400"
                                )}
                              >
                                {row.optionType}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-bold",
                              row.side === "BUY"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-rose-500/15 text-rose-400"
                            )}
                          >
                            {row.side}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-foreground">
                          {Math.abs(row.quantity).toLocaleString("en-IN")}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {row.entryPrice.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-foreground">
                          {row.livePrice > 0 ? row.livePrice.toFixed(2) : "--"}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-2 text-right tabular-nums font-semibold",
                            row.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {fmtPnl(row.unrealizedPnl)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleClose(row)}
                            className="rounded border border-border bg-background/70 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
                          >
                            Close
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {activeTab === "orders" && (
              pendingOrders.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No pending orders</p>
              ) : (
                <table className="w-full min-w-[600px] text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-[11px] text-muted-foreground">
                      <th className="px-4 py-2 text-left font-medium">Symbol</th>
                      <th className="px-2 py-2 text-center font-medium">Side</th>
                      <th className="px-2 py-2 text-center font-medium">Type</th>
                      <th className="px-2 py-2 text-right font-medium">Qty</th>
                      <th className="px-2 py-2 text-right font-medium">Price</th>
                      <th className="px-2 py-2 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingOrders.map((order) => {
                      const o = order as unknown as Record<string, unknown>;
                      return (
                        <tr
                          key={String(o.id || Math.random())}
                          className="border-b border-border hover:bg-muted/50"
                        >
                          <td className="px-4 py-2 font-medium text-foreground">{String(o.symbol || "")}</td>
                          <td className="px-2 py-2 text-center">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-bold",
                                String(o.side) === "BUY"
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : "bg-rose-500/15 text-rose-400"
                              )}
                            >
                              {String(o.side || "")}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center text-muted-foreground">{String(o.orderType || "")}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-foreground">{String(o.quantity || "")}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                            {o.limitPrice ? `₹${Number(o.limitPrice).toFixed(2)}` : "Market"}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                              {String(o.status || "OPEN")}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

