"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { OptionChainRow } from "@/components/trade/options/types";
import { cn } from "@/lib/utils";
import { useMarketStore } from "@/stores/trading/market.store";

type OptionChainTableProps = {
  rows: OptionChainRow[];
  underlyingPrice: number;
  atmStrike: number | null;
  expiryKey?: string;
  chainKey?: string;
  optionTokenBySymbol: Record<string, string>;
  selectedSymbol?: string | null;
  onSelectSymbol: (symbol: string) => void;
  isLoading?: boolean;
};

type FlashDir = "up" | "down";
type StrikeRange = "10" | "20" | "full";

function fmtLtp(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "--";
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtOI(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "--";
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

// Opacity based on distance from ATM — deep OTM fades out
function getRowOpacity(strike: number, atm: number | null, spotPrice: number): number {
  if (!atm || !Number.isFinite(spotPrice) || spotPrice <= 0) return 1;
  const pct = Math.abs(strike - atm) / spotPrice;
  if (pct < 0.005) return 1;
  if (pct < 0.015) return 0.92;
  if (pct < 0.03) return 0.78;
  if (pct < 0.05) return 0.58;
  if (pct < 0.08) return 0.38;
  return 0.22;
}

function SkeletonRow({ i }: { i: number }) {
  return (
    <div
      className="grid grid-cols-[1fr_100px_1fr] border-b border-white/[0.04]"
      style={{ opacity: 1 - i * 0.12 }}
    >
      {/* CE side */}
      <div className="flex items-center justify-end gap-6 px-4 py-2.5">
        <div className="h-2.5 w-14 animate-pulse rounded bg-white/[0.08]" />
        <div className="h-2.5 w-10 animate-pulse rounded bg-white/[0.05]" />
        <div className="h-2.5 w-10 animate-pulse rounded bg-white/[0.04]" />
      </div>
      {/* Strike */}
      <div className="flex items-center justify-center bg-white/[0.02] px-2 py-2.5">
        <div className="h-2.5 w-14 animate-pulse rounded bg-white/[0.07]" />
      </div>
      {/* PE side */}
      <div className="flex items-center gap-6 px-4 py-2.5">
        <div className="h-2.5 w-14 animate-pulse rounded bg-white/[0.08]" />
        <div className="h-2.5 w-10 animate-pulse rounded bg-white/[0.05]" />
        <div className="h-2.5 w-10 animate-pulse rounded bg-white/[0.04]" />
      </div>
    </div>
  );
}

type RowProps = {
  row: OptionChainRow;
  ceLtp: number;
  peLtp: number;
  isAtm: boolean;
  spotPrice: number;
  atm: number | null;
  selectedSymbol?: string | null;
  onSelectSymbol: (sym: string) => void;
  ceFlash?: FlashDir;
  peFlash?: FlashDir;
  rowRef: (el: HTMLDivElement | null) => void;
};

const ChainRow = memo(function ChainRow({
  row, ceLtp, peLtp, isAtm, spotPrice, atm,
  selectedSymbol, onSelectSymbol, ceFlash, peFlash, rowRef,
}: RowProps) {
  const ceItm = spotPrice > 0 && row.strike < spotPrice;
  const peItm = spotPrice > 0 && row.strike > spotPrice;
  const ceSelected = !!selectedSymbol && row.ce?.symbol === selectedSymbol;
  const peSelected = !!selectedSymbol && row.pe?.symbol === selectedSymbol;
  const opacity = getRowOpacity(row.strike, atm, spotPrice);

  return (
    <div
      ref={rowRef}
      className={cn(
        "group grid grid-cols-[1fr_100px_1fr] border-b border-white/[0.04] transition-opacity",
        isAtm && "border-b-[#2d6cff]/30 bg-[#2d6cff]/[0.07]"
      )}
      style={{ opacity: isAtm ? 1 : opacity }}
    >
      {/* ── CALL (CE) SIDE — right-aligned ── */}
      <button
        type="button"
        onClick={() => row.ce?.symbol && onSelectSymbol(row.ce.symbol)}
        disabled={!row.ce?.symbol}
        className={cn(
          "grid grid-cols-3 items-center px-4 py-2 text-right transition-colors",
          ceSelected && "bg-emerald-500/[0.12] ring-1 ring-inset ring-emerald-500/40",
          !ceSelected && row.ce?.symbol && "hover:bg-emerald-500/[0.07]",
          ceItm && !ceSelected && "bg-emerald-500/[0.05]"
        )}
      >
        {/* LTP */}
        <span
          className={cn(
            "col-start-1 text-[13px] font-semibold tabular-nums",
            ceFlash === "up" && "text-emerald-400",
            ceFlash === "down" && "text-rose-400",
            !ceFlash && "text-slate-100"
          )}
        >
          {fmtLtp(ceLtp)}
        </span>
        {/* OI */}
        <span className="col-start-2 text-[11px] tabular-nums text-slate-500">
          {fmtOI(Number(row.ce?.oi ?? 0))}
        </span>
        {/* VOL */}
        <span className="col-start-3 text-[11px] tabular-nums text-slate-600">
          {fmtOI(Number(row.ce?.volume ?? 0))}
        </span>
      </button>

      {/* ── STRIKE CENTER ── */}
      <div
        className={cn(
          "flex items-center justify-center bg-white/[0.025] px-2 py-2",
          isAtm && "bg-[#2d6cff]/[0.15]"
        )}
      >
        {isAtm && (
          <span className="mr-1 rounded bg-[#2d6cff] px-1 py-0.5 text-[9px] font-bold tracking-widest text-white">
            ATM
          </span>
        )}
        <span
          className={cn(
            "text-[13px] font-bold tabular-nums",
            isAtm ? "text-[#8fb3ff]" : "text-slate-300"
          )}
        >
          {row.strike.toLocaleString("en-IN")}
        </span>
      </div>

      {/* ── PUT (PE) SIDE — left-aligned ── */}
      <button
        type="button"
        onClick={() => row.pe?.symbol && onSelectSymbol(row.pe.symbol)}
        disabled={!row.pe?.symbol}
        className={cn(
          "grid grid-cols-3 items-center px-4 py-2 text-left transition-colors",
          peSelected && "bg-rose-500/[0.12] ring-1 ring-inset ring-rose-500/40",
          !peSelected && row.pe?.symbol && "hover:bg-rose-500/[0.07]",
          peItm && !peSelected && "bg-rose-500/[0.05]"
        )}
      >
        {/* LTP */}
        <span
          className={cn(
            "col-start-1 text-[13px] font-semibold tabular-nums",
            peFlash === "up" && "text-emerald-400",
            peFlash === "down" && "text-rose-400",
            !peFlash && "text-slate-100"
          )}
        >
          {fmtLtp(peLtp)}
        </span>
        {/* OI */}
        <span className="col-start-2 text-[11px] tabular-nums text-slate-500">
          {fmtOI(Number(row.pe?.oi ?? 0))}
        </span>
        {/* VOL */}
        <span className="col-start-3 text-[11px] tabular-nums text-slate-600">
          {fmtOI(Number(row.pe?.volume ?? 0))}
        </span>
      </button>
    </div>
  );
}, (prev, next) => (
  prev.ceLtp === next.ceLtp && prev.peLtp === next.peLtp &&
  prev.isAtm === next.isAtm && prev.spotPrice === next.spotPrice &&
  prev.atm === next.atm && prev.selectedSymbol === next.selectedSymbol &&
  prev.ceFlash === next.ceFlash && prev.peFlash === next.peFlash &&
  prev.row.strike === next.row.strike &&
  prev.row.ce?.symbol === next.row.ce?.symbol &&
  prev.row.pe?.symbol === next.row.pe?.symbol
));

export function OptionChainTable({
  rows, underlyingPrice, atmStrike, expiryKey, chainKey,
  optionTokenBySymbol, selectedSymbol, onSelectSymbol, isLoading = false,
}: OptionChainTableProps) {
  const quotes = useMarketStore((s) => s.quotesByInstrument);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const prevLtp = useRef<Record<string, number>>({});
  const [flashMap, setFlashMap] = useState<Record<string, FlashDir>>({});
  const [strikeRange, setStrikeRange] = useState<StrikeRange>("20");
  const lastAtm = useRef<number | null>(null);
  const lastExpiry = useRef<string>("");

  // Derived ATM
  const derivedAtm = useMemo(() => {
    if (atmStrike) return atmStrike;
    if (!rows.length || !Number.isFinite(underlyingPrice) || underlyingPrice <= 0) return null;
    let best = rows[0]?.strike ?? null;
    let minD = best === null ? Infinity : Math.abs(best - underlyingPrice);
    for (const r of rows) {
      const d = Math.abs(r.strike - underlyingPrice);
      if (d < minD) { minD = d; best = r.strike; }
    }
    return best;
  }, [atmStrike, rows, underlyingPrice]);

  // Strike filter
  const filteredRows = useMemo(() => {
    if (strikeRange === "full" || !derivedAtm) return rows;
    const n = strikeRange === "10" ? 10 : 20;
    const idx = rows.findIndex((r) => r.strike === derivedAtm);
    if (idx < 0) return rows;
    return rows.slice(Math.max(0, idx - n), Math.min(rows.length, idx + n + 1));
  }, [rows, derivedAtm, strikeRange]);

  // Auto-scroll to ATM
  useEffect(() => {
    if (!derivedAtm || !filteredRows.length) return;
    const atmChanged = lastAtm.current !== derivedAtm;
    const expiryChanged = lastExpiry.current !== (expiryKey || "");
    if (!atmChanged && !expiryChanged) return;
    const el = rowRefs.current[derivedAtm];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      lastAtm.current = derivedAtm;
      lastExpiry.current = expiryKey || "";
    }
  }, [derivedAtm, expiryKey, filteredRows.length]);

  // Reset flash/scroll state when expiry changes
  useEffect(() => {
    prevLtp.current = {};
    setFlashMap({});
    lastAtm.current = null;
    lastExpiry.current = "";
  }, [expiryKey]);

  const rowsWithDisplay = useMemo(() =>
    filteredRows.map((row) => {
      const ceToken = row.ce?.symbol ? optionTokenBySymbol[row.ce.symbol] : "";
      const peToken = row.pe?.symbol ? optionTokenBySymbol[row.pe.symbol] : "";
      const liveCe = ceToken ? Number(quotes[ceToken]?.price ?? 0) : 0;
      const livePe = peToken ? Number(quotes[peToken]?.price ?? 0) : 0;
      const fallCe = Number.isFinite(Number(row.ce?.ltp)) ? Number(row.ce?.ltp) : 0;
      const fallPe = Number.isFinite(Number(row.pe?.ltp)) ? Number(row.pe?.ltp) : 0;
      return { row, ceLtp: liveCe > 0 ? liveCe : fallCe, peLtp: livePe > 0 ? livePe : fallPe };
    }),
    [filteredRows, optionTokenBySymbol, quotes]
  );

  // Flash detection
  useEffect(() => {
    if (!rowsWithDisplay.length) return;
    const nextFlash: Record<string, FlashDir> = {};
    const nextPrev = { ...prevLtp.current };
    for (const { row, ceLtp, peLtp } of rowsWithDisplay) {
      if (row.ce?.symbol) {
        const p = prevLtp.current[row.ce.symbol];
        if (Number.isFinite(p) && p !== ceLtp) nextFlash[row.ce.symbol] = ceLtp > p ? "up" : "down";
        nextPrev[row.ce.symbol] = ceLtp;
      }
      if (row.pe?.symbol) {
        const p = prevLtp.current[row.pe.symbol];
        if (Number.isFinite(p) && p !== peLtp) nextFlash[row.pe.symbol] = peLtp > p ? "up" : "down";
        nextPrev[row.pe.symbol] = peLtp;
      }
    }
    prevLtp.current = nextPrev;
    if (!Object.keys(nextFlash).length) return;
    setFlashMap((prev) => ({ ...prev, ...nextFlash }));
    const timer = window.setTimeout(() => {
      setFlashMap((prev) => {
        const copy = { ...prev };
        for (const k of Object.keys(nextFlash)) delete copy[k];
        return copy;
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [rowsWithDisplay]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sticky column headers */}
      <div className="shrink-0 border-b border-white/[0.06] bg-[#0d1422]">
        {/* Sub-header: range selector */}
        <div className="flex items-center justify-between px-4 py-1.5">
          <div className="flex items-center gap-1 text-[11px] text-slate-600">
            <span className="text-emerald-400/70 font-semibold">CALLS</span>
            <span className="mx-2 text-white/10">|</span>
            <span className="text-rose-400/70 font-semibold">PUTS</span>
          </div>
          <div className="flex items-center gap-1">
            {(["10", "20", "full"] as StrikeRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setStrikeRange(r)}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-semibold transition-colors",
                  strikeRange === r
                    ? "bg-[#2d6cff]/20 text-[#8fb3ff]"
                    : "text-slate-600 hover:text-slate-400"
                )}
              >
                {r === "full" ? "All" : `±${r}`}
              </button>
            ))}
          </div>
        </div>

        {/* Column labels */}
        <div className="grid grid-cols-[1fr_100px_1fr] border-t border-white/[0.04] bg-white/[0.02] text-[11px] font-semibold">
          <div className="grid grid-cols-3 px-4 py-2 text-right">
            <span className="col-start-1 text-emerald-400/70">LTP</span>
            <span className="col-start-2 text-slate-600">OI</span>
            <span className="col-start-3 text-slate-600">VOL</span>
          </div>
          <div className="flex items-center justify-center bg-white/[0.02] py-2 text-slate-500">
            STRIKE
          </div>
          <div className="grid grid-cols-3 px-4 py-2 text-left">
            <span className="col-start-1 text-rose-400/70">LTP</span>
            <span className="col-start-2 text-slate-600">OI</span>
            <span className="col-start-3 text-slate-600">VOL</span>
          </div>
        </div>
      </div>

      {/* Scrollable rows */}
      <div className="flex-1 overflow-y-auto [scrollbar-color:rgba(148,163,184,.25)_transparent] [scrollbar-width:thin]">
        {isLoading ? (
          <div>
            {Array.from({ length: 12 }, (_, i) => (
              <SkeletonRow key={i} i={i} />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-600">
            No strikes available. Select an expiry to load the chain.
          </div>
        ) : (
          <div>
            {rowsWithDisplay.map(({ row, ceLtp, peLtp }) => {
              const isAtm = derivedAtm !== null && row.strike === derivedAtm;
              return (
                <ChainRow
                  key={row.strike}
                  row={row}
                  ceLtp={ceLtp}
                  peLtp={peLtp}
                  isAtm={isAtm}
                  spotPrice={underlyingPrice}
                  atm={derivedAtm}
                  selectedSymbol={selectedSymbol}
                  onSelectSymbol={onSelectSymbol}
                  ceFlash={flashMap[row.ce?.symbol || ""]}
                  peFlash={flashMap[row.pe?.symbol || ""]}
                  rowRef={(el) => { rowRefs.current[row.strike] = el; }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
