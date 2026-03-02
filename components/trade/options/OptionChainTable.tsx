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
  onSelectSymbol: (symbol: string, side?: "BUY" | "SELL") => void;
  isLoading?: boolean;
  mobileMode?: boolean;
};

type FlashDir = "up" | "down";

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

function SkeletonRow({ i, total }: { i: number; total: number }) {
  // Center is ATM (max opacity), edges fade out
  const center = Math.floor(total / 2);
  const dist = Math.abs(i - center);
  const opacity = Math.max(0.4, 1 - dist * 0.1);

  return (
    <div
      className="grid grid-cols-[1fr_100px_1fr] border-b border-border/60 dark:border-white/[0.08]"
      style={{ opacity }}
    >
      {/* CE side */}
      <div className="grid grid-cols-3 items-center px-4 py-2.5 text-right">
        <div className="h-3 w-10 ml-auto animate-pulse rounded bg-slate-300/80 dark:bg-slate-600/70 col-start-1" />
        <div className="h-3 w-8 ml-auto animate-pulse rounded bg-slate-300/70 dark:bg-slate-600/60 col-start-2" />
        <div className="h-3 w-8 ml-auto animate-pulse rounded bg-slate-300/60 dark:bg-slate-700/55 col-start-3" />
      </div>
      {/* Strike */}
      <div className="flex items-center justify-center bg-slate-200/40 dark:bg-white/[0.05] px-2 py-2.5">
        <div className="h-3.5 w-12 animate-pulse rounded bg-slate-300/85 dark:bg-slate-500/70" />
      </div>
      {/* PE side */}
      <div className="grid grid-cols-3 items-center px-4 py-2.5 text-left">
        <div className="h-3 w-10 animate-pulse rounded bg-slate-300/80 dark:bg-slate-600/70 col-start-1" />
        <div className="h-3 w-8 animate-pulse rounded bg-slate-300/70 dark:bg-slate-600/60 col-start-2" />
        <div className="h-3 w-8 animate-pulse rounded bg-slate-300/60 dark:bg-slate-700/55 col-start-3" />
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
  onSelectSymbol: (sym: string, side?: "BUY" | "SELL") => void;
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
      <div
        className={cn(
          "relative grid grid-cols-3 items-center px-4 py-2 text-right transition-colors cursor-pointer",
          ceSelected && "bg-emerald-500/[0.12] ring-1 ring-inset ring-emerald-500/40",
          !ceSelected && row.ce?.symbol && "hover:bg-emerald-500/[0.07]",
          ceItm && !ceSelected && "bg-emerald-500/[0.05]"
        )}
        onClick={() => row.ce?.symbol && onSelectSymbol(row.ce.symbol)}
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
        <span className="col-start-3 text-[11px] tabular-nums text-slate-600 group-hover:invisible">
          {fmtOI(Number(row.ce?.volume ?? 0))}
        </span>
        {row.ce?.symbol && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              onClick={(e) => { e.stopPropagation(); onSelectSymbol(row.ce!.symbol, "BUY"); }}
            >B</button>
            <button 
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded bg-rose-500/20 text-[10px] font-bold text-rose-400 hover:bg-rose-500/30 transition-colors"
              onClick={(e) => { e.stopPropagation(); onSelectSymbol(row.ce!.symbol, "SELL"); }}
            >S</button>
          </div>
        )}
      </div>

      {/* ── STRIKE CENTER ── */}
      <div
        className={cn(
          "flex items-center justify-center bg-white/[0.025] px-2 py-2 transition-colors cursor-pointer",
          isAtm && "bg-[#2d6cff]/[0.15]",
          (row.ce?.symbol || row.pe?.symbol) && "hover:bg-white/[0.06]"
        )}
        onClick={() => {
          const fallbackSymbol = row.ce?.symbol || row.pe?.symbol;
          if (fallbackSymbol) onSelectSymbol(fallbackSymbol);
        }}
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
      <div
        className={cn(
          "relative grid grid-cols-3 items-center px-4 py-2 text-left transition-colors cursor-pointer",
          peSelected && "bg-rose-500/[0.12] ring-1 ring-inset ring-rose-500/40",
          !peSelected && row.pe?.symbol && "hover:bg-rose-500/[0.07]",
          peItm && !peSelected && "bg-rose-500/[0.05]"
        )}
        onClick={() => row.pe?.symbol && onSelectSymbol(row.pe.symbol)}
      >
        {/* LTP */}
        <span
          className={cn(
            "col-start-1 text-[13px] font-semibold tabular-nums group-hover:invisible",
            peFlash === "up" && "text-emerald-400",
            peFlash === "down" && "text-rose-400",
            !peFlash && "text-slate-100"
          )}
        >
          {fmtLtp(peLtp)}
        </span>
        {row.pe?.symbol && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              onClick={(e) => { e.stopPropagation(); onSelectSymbol(row.pe!.symbol, "BUY"); }}
            >B</button>
            <button 
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded bg-rose-500/20 text-[10px] font-bold text-rose-400 hover:bg-rose-500/30 transition-colors"
              onClick={(e) => { e.stopPropagation(); onSelectSymbol(row.pe!.symbol, "SELL"); }}
            >S</button>
          </div>
        )}
        {/* OI */}
        <span className="col-start-2 text-[11px] tabular-nums text-slate-500">
          {fmtOI(Number(row.pe?.oi ?? 0))}
        </span>
        {/* VOL */}
        <span className="col-start-3 text-[11px] tabular-nums text-slate-600">
          {fmtOI(Number(row.pe?.volume ?? 0))}
        </span>
      </div>
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
  optionTokenBySymbol, selectedSymbol, onSelectSymbol, isLoading = false, mobileMode = false,
}: OptionChainTableProps) {
  const quotes = useMarketStore((s) => s.quotesByInstrument);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const prevLtp = useRef<Record<string, number>>({});
  const [flashMap, setFlashMap] = useState<Record<string, FlashDir>>({});
  const [visibleRadius, setVisibleRadius] = useState(10);
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

  // Strike filter (5 above / 5 below relative to ATM)
  const filteredRows = useMemo(() => {
    if (!derivedAtm) return rows;
    const idx = rows.findIndex((r) => r.strike === derivedAtm);
    if (idx < 0) return rows;
    return rows.slice(Math.max(0, idx - visibleRadius), Math.min(rows.length, idx + visibleRadius + 1));
  }, [rows, derivedAtm, visibleRadius]);

  const canLoadMoreTop = useMemo(() => {
    if (!derivedAtm) return false;
    const idx = rows.findIndex((r) => r.strike === derivedAtm);
    return idx > visibleRadius;
  }, [rows, derivedAtm, visibleRadius]);

  const canLoadMoreBottom = useMemo(() => {
    if (!derivedAtm) return false;
    const idx = rows.findIndex((r) => r.strike === derivedAtm);
    return idx + visibleRadius < rows.length - 1;
  }, [rows, derivedAtm, visibleRadius]);

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
    setVisibleRadius(10); // Reset radius on expiry change
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
    <div className={cn("flex h-full flex-col overflow-hidden", mobileMode && "overflow-x-auto")}>
      <div className={cn("flex h-full flex-col overflow-hidden", mobileMode && "min-w-[640px]")}>
      {/* Sticky column headers */}
      <div className="shrink-0 border-b border-white/[0.06] bg-[#0d1422]">
        {/* Sub-header: range selector */}
        <div className="flex items-center justify-between px-4 py-1.5 min-h-[28px]">
          <div className="flex items-center gap-1 text-[11px] text-slate-600">
            <span className="text-emerald-400/70 font-semibold">CALLS</span>
            <span className="mx-2 text-white/10">|</span>
            <span className="text-rose-400/70 font-semibold">PUTS</span>
          </div>
          {/* No buttons on the right, removed 10/20/full selector */}
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
        {mobileMode && (
          <div className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0d1422] px-4 py-1.5 text-[11px] text-slate-400">
            ATM: <span className="font-semibold text-[#8fb3ff]">{derivedAtm ? derivedAtm.toLocaleString("en-IN") : "--"}</span>
            <span className="mx-2 text-white/20">|</span>
            Spot: <span className="font-semibold text-slate-200">{fmtLtp(underlyingPrice)}</span>
          </div>
        )}
        {isLoading ? (
          <div>
            {Array.from({ length: 21 }, (_, i) => (
              <SkeletonRow key={i} i={i} total={21} />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-600">
            No strikes available. Select an expiry to load the chain.
          </div>
        ) : (
          <div>
            {canLoadMoreTop && (
              <div 
                className="py-3 text-center text-xs text-[#2d6cff] font-semibold hover:text-[#8fb3ff] hover:bg-[#2d6cff]/5 cursor-pointer transition-colors border-b border-white/[0.04]" 
                onClick={() => setVisibleRadius(r => r + 5)}
              >
                Load more +
              </div>
            )}
            
            {rowsWithDisplay.map(({ row, ceLtp, peLtp }) => {
              const isAtm = derivedAtm !== null && row.strike === derivedAtm;
              const isExpanded =
                selectedSymbol === row.ce?.symbol || selectedSymbol === row.pe?.symbol;
              return (
                <div key={row.strike}>
                  <ChainRow
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
                  {mobileMode && isExpanded && (
                    <div className="grid grid-cols-2 border-b border-white/[0.04] bg-white/[0.02] px-4 py-2 text-[11px] text-slate-400">
                      <div className="pr-2">
                        <p className="font-semibold text-emerald-300">CE details</p>
                        <p>OI: {fmtOI(Number(row.ce?.oi ?? 0))}</p>
                        <p>VOL: {fmtOI(Number(row.ce?.volume ?? 0))}</p>
                        <p>LTP: {fmtLtp(ceLtp)}</p>
                      </div>
                      <div className="pl-2 text-right">
                        <p className="font-semibold text-rose-300">PE details</p>
                        <p>OI: {fmtOI(Number(row.pe?.oi ?? 0))}</p>
                        <p>VOL: {fmtOI(Number(row.pe?.volume ?? 0))}</p>
                        <p>LTP: {fmtLtp(peLtp)}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {canLoadMoreBottom && (
              <div 
                className="py-3 text-center text-xs text-[#2d6cff] font-semibold hover:text-[#8fb3ff] hover:bg-[#2d6cff]/5 cursor-pointer transition-colors border-t border-white/[0.04]" 
                onClick={() => setVisibleRadius(r => r + 5)}
              >
                Load more +
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
