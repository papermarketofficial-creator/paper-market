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

function SkeletonRow({ i, total }: { i: number; total: number }) {
  const center = Math.floor(total / 2);
  const dist = Math.abs(i - center);
  const isNearCenter = dist <= 1;

  return (
    <div className="grid grid-cols-[1fr_108px_1fr] border-b border-border/60">
      <div className="grid grid-cols-3 items-center px-4 py-2.5 text-right">
        <div className="col-start-1 ml-auto h-3 w-10 animate-pulse rounded bg-slate-300/80 dark:bg-slate-600/70" />
        <div className="col-start-2 ml-auto h-3 w-8 animate-pulse rounded bg-slate-300/70 dark:bg-slate-600/60" />
        <div className="col-start-3 ml-auto h-3 w-8 animate-pulse rounded bg-slate-300/60 dark:bg-slate-700/55" />
      </div>

      <div className="flex items-center justify-center border-x border-border/60 bg-muted/35 px-2 py-2.5">
        <div
          className={cn(
            "h-3.5 w-12 animate-pulse rounded bg-slate-300/85 dark:bg-slate-500/70",
            isNearCenter && "h-4 w-14",
          )}
        />
      </div>

      <div className="grid grid-cols-3 items-center px-4 py-2.5 text-left">
        <div className="col-start-1 h-3 w-10 animate-pulse rounded bg-slate-300/80 dark:bg-slate-600/70" />
        <div className="col-start-2 h-3 w-8 animate-pulse rounded bg-slate-300/70 dark:bg-slate-600/60" />
        <div className="col-start-3 h-3 w-8 animate-pulse rounded bg-slate-300/60 dark:bg-slate-700/55" />
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
  selectedSymbol?: string | null;
  onSelectSymbol: (sym: string, side?: "BUY" | "SELL") => void;
  ceFlash?: FlashDir;
  peFlash?: FlashDir;
  rowRef: (el: HTMLDivElement | null) => void;
};

const ChainRow = memo(
  function ChainRow({
    row,
    ceLtp,
    peLtp,
    isAtm,
    spotPrice,
    selectedSymbol,
    onSelectSymbol,
    ceFlash,
    peFlash,
    rowRef,
  }: RowProps) {
    const ceItm = spotPrice > 0 && row.strike < spotPrice;
    const peItm = spotPrice > 0 && row.strike > spotPrice;
    const ceSelected = !!selectedSymbol && row.ce?.symbol === selectedSymbol;
    const peSelected = !!selectedSymbol && row.pe?.symbol === selectedSymbol;

    return (
      <div
        ref={rowRef}
        className={cn(
          "grid grid-cols-[1fr_108px_1fr] border-b border-border/70 bg-background/45 transition-colors duration-150 hover:bg-muted/25",
          isAtm && "border-b-primary/40 bg-primary/10",
        )}
      >
        <div
          className={cn(
            "group/ce relative grid cursor-pointer grid-cols-3 items-center px-4 py-2.5 text-right transition-colors",
            ceSelected && "bg-emerald-500/12 ring-1 ring-inset ring-emerald-500/45",
            !ceSelected && row.ce?.symbol && "hover:bg-emerald-500/8",
            ceItm && !ceSelected && "bg-emerald-500/6",
          )}
          onClick={() => row.ce?.symbol && onSelectSymbol(row.ce.symbol)}
        >
          <span
            className={cn(
              "col-start-1 text-[13px] font-semibold tabular-nums text-foreground/95",
              ceFlash === "up" && "text-emerald-400",
              ceFlash === "down" && "text-rose-400",
              ceSelected && "text-emerald-500 dark:text-emerald-300",
            )}
          >
            {fmtLtp(ceLtp)}
          </span>

          <span className="col-start-2 text-[11px] tabular-nums text-muted-foreground">
            {fmtOI(Number(row.ce?.oi ?? 0))}
          </span>

          <span className="col-start-3 text-[11px] tabular-nums text-muted-foreground">
            {fmtOI(Number(row.ce?.volume ?? 0))}
          </span>

          {row.ce?.symbol && (
            <div className="pointer-events-none absolute inset-y-0 right-2 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover/ce:opacity-100 group-focus-within/ce:opacity-100">
              <button
                type="button"
                aria-label="Buy call option"
                className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md border border-emerald-600 bg-emerald-600 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-emerald-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSymbol(row.ce!.symbol, "BUY");
                }}
              >
                B
              </button>
              <button
                type="button"
                aria-label="Sell call option"
                className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md border border-rose-600 bg-rose-600 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-rose-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSymbol(row.ce!.symbol, "SELL");
                }}
              >
                S
              </button>
            </div>
          )}
        </div>

        <div
          className={cn(
            "flex cursor-pointer items-center justify-center border-x border-border/70 bg-muted/35 px-2 py-2.5 transition-colors",
            isAtm && "bg-primary/18",
            (row.ce?.symbol || row.pe?.symbol) && "hover:bg-muted/70",
          )}
          onClick={() => {
            const fallbackSymbol = row.ce?.symbol || row.pe?.symbol;
            if (fallbackSymbol) onSelectSymbol(fallbackSymbol);
          }}
        >
          {isAtm && (
            <span className="mr-1 rounded bg-primary px-1 py-0.5 text-[9px] font-bold tracking-widest text-primary-foreground shadow-sm">
              ATM
            </span>
          )}
          <span className={cn("text-[13px] font-bold tabular-nums", isAtm ? "text-primary" : "text-foreground")}>
            {row.strike.toLocaleString("en-IN")}
          </span>
        </div>

        <div
          className={cn(
            "group/pe relative grid cursor-pointer grid-cols-3 items-center px-4 py-2.5 text-left transition-colors",
            peSelected && "bg-rose-500/12 ring-1 ring-inset ring-rose-500/45",
            !peSelected && row.pe?.symbol && "hover:bg-rose-500/8",
            peItm && !peSelected && "bg-rose-500/6",
          )}
          onClick={() => row.pe?.symbol && onSelectSymbol(row.pe.symbol)}
        >
          <span
            className={cn(
              "col-start-1 text-[13px] font-semibold tabular-nums text-foreground/95 transition-opacity group-hover/pe:opacity-0",
              peFlash === "up" && "text-emerald-400",
              peFlash === "down" && "text-rose-400",
              peSelected && "text-rose-500 dark:text-rose-300",
            )}
          >
            {fmtLtp(peLtp)}
          </span>

          {row.pe?.symbol && (
            <div className="pointer-events-none absolute inset-y-0 left-2 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover/pe:opacity-100 group-focus-within/pe:opacity-100">
              <button
                type="button"
                aria-label="Buy put option"
                className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md border border-emerald-600 bg-emerald-600 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-emerald-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSymbol(row.pe!.symbol, "BUY");
                }}
              >
                B
              </button>
              <button
                type="button"
                aria-label="Sell put option"
                className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md border border-rose-600 bg-rose-600 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-rose-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSymbol(row.pe!.symbol, "SELL");
                }}
              >
                S
              </button>
            </div>
          )}

          <span className="col-start-2 text-[11px] tabular-nums text-muted-foreground">
            {fmtOI(Number(row.pe?.oi ?? 0))}
          </span>

          <span className="col-start-3 text-[11px] tabular-nums text-muted-foreground">
            {fmtOI(Number(row.pe?.volume ?? 0))}
          </span>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.ceLtp === next.ceLtp &&
    prev.peLtp === next.peLtp &&
    prev.isAtm === next.isAtm &&
    prev.spotPrice === next.spotPrice &&
    prev.selectedSymbol === next.selectedSymbol &&
    prev.ceFlash === next.ceFlash &&
    prev.peFlash === next.peFlash &&
    prev.row.strike === next.row.strike &&
    prev.row.ce?.symbol === next.row.ce?.symbol &&
    prev.row.pe?.symbol === next.row.pe?.symbol,
);

export function OptionChainTable({
  rows,
  underlyingPrice,
  atmStrike,
  expiryKey,
  chainKey,
  optionTokenBySymbol,
  selectedSymbol,
  onSelectSymbol,
  isLoading = false,
  mobileMode = false,
}: OptionChainTableProps) {
  const quotes = useMarketStore((s) => s.quotesByInstrument);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const prevLtp = useRef<Record<string, number>>({});
  const [flashMap, setFlashMap] = useState<Record<string, FlashDir>>({});
  const [visibleRadius, setVisibleRadius] = useState(10);
  const [mobileLeg, setMobileLeg] = useState<"CE" | "PE">("CE");
  const lastAtm = useRef<number | null>(null);
  const lastExpiry = useRef<string>("");

  // Keep as dependency anchor for potential future telemetry hooks.
  void chainKey;

  const derivedAtm = useMemo(() => {
    if (atmStrike) return atmStrike;
    if (!rows.length || !Number.isFinite(underlyingPrice) || underlyingPrice <= 0) return null;

    let best = rows[0]?.strike ?? null;
    let minD = best === null ? Infinity : Math.abs(best - underlyingPrice);
    for (const r of rows) {
      const d = Math.abs(r.strike - underlyingPrice);
      if (d < minD) {
        minD = d;
        best = r.strike;
      }
    }
    return best;
  }, [atmStrike, rows, underlyingPrice]);

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

  useEffect(() => {
    prevLtp.current = {};
    setFlashMap({});
    lastAtm.current = null;
    lastExpiry.current = "";
    setVisibleRadius(10);
    setMobileLeg("CE");
  }, [expiryKey]);

  const rowsWithDisplay = useMemo(
    () =>
      filteredRows.map((row) => {
        const ceToken = row.ce?.symbol ? optionTokenBySymbol[row.ce.symbol] : "";
        const peToken = row.pe?.symbol ? optionTokenBySymbol[row.pe.symbol] : "";

        const liveCe = ceToken ? Number(quotes[ceToken]?.price ?? 0) : 0;
        const livePe = peToken ? Number(quotes[peToken]?.price ?? 0) : 0;

        const fallCe = Number.isFinite(Number(row.ce?.ltp)) ? Number(row.ce?.ltp) : 0;
        const fallPe = Number.isFinite(Number(row.pe?.ltp)) ? Number(row.pe?.ltp) : 0;

        return {
          row,
          ceLtp: liveCe > 0 ? liveCe : fallCe,
          peLtp: livePe > 0 ? livePe : fallPe,
        };
      }),
    [filteredRows, optionTokenBySymbol, quotes],
  );

  useEffect(() => {
    if (!rowsWithDisplay.length) return;

    const nextFlash: Record<string, FlashDir> = {};
    const nextPrev = { ...prevLtp.current };

    for (const { row, ceLtp, peLtp } of rowsWithDisplay) {
      if (row.ce?.symbol) {
        const p = prevLtp.current[row.ce.symbol];
        if (Number.isFinite(p) && p !== ceLtp) {
          nextFlash[row.ce.symbol] = ceLtp > p ? "up" : "down";
        }
        nextPrev[row.ce.symbol] = ceLtp;
      }

      if (row.pe?.symbol) {
        const p = prevLtp.current[row.pe.symbol];
        if (Number.isFinite(p) && p !== peLtp) {
          nextFlash[row.pe.symbol] = peLtp > p ? "up" : "down";
        }
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

  if (mobileMode) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border bg-card">
          <div className="px-3 py-2">
            <div className="relative grid h-9 grid-cols-2 overflow-hidden rounded-full bg-muted/45 p-1">
              <span
                className={cn(
                  "absolute inset-y-1 w-[calc(50%-4px)] rounded-full border transition-transform duration-200",
                  mobileLeg === "CE"
                    ? "translate-x-0 border-emerald-400/40 bg-emerald-500/15"
                    : "translate-x-[calc(100%+4px)] border-rose-400/40 bg-rose-500/15",
                )}
              />
              <button
                type="button"
                onClick={() => setMobileLeg("CE")}
                className={cn(
                  "relative z-10 rounded-full text-xs font-semibold transition-colors",
                  mobileLeg === "CE" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground",
                )}
              >
                CE (Calls)
              </button>
              <button
                type="button"
                onClick={() => setMobileLeg("PE")}
                className={cn(
                  "relative z-10 rounded-full text-xs font-semibold transition-colors",
                  mobileLeg === "PE" ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground",
                )}
              >
                PE (Puts)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 border-t border-border bg-muted/35 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
            {mobileLeg === "CE" ? (
              <>
                <span className="text-emerald-600 dark:text-emerald-300">LTP</span>
                <span className="text-center">OI</span>
                <span className="text-center">VOL</span>
                <span className="text-right">STRIKE</span>
              </>
            ) : (
              <>
                <span>STRIKE</span>
                <span className="text-center text-rose-600 dark:text-rose-300">LTP</span>
                <span className="text-center">OI</span>
                <span className="text-right">VOL</span>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 border-t border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground">
            <div>
              ATM:{" "}
              <span className="font-semibold text-primary">
                {derivedAtm ? derivedAtm.toLocaleString("en-IN") : "--"}
              </span>
            </div>
            <div className="text-right">
              Spot: <span className="font-semibold text-foreground">{fmtLtp(underlyingPrice)}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-background [scrollbar-color:rgba(148,163,184,.25)_transparent] [scrollbar-width:thin]">
          {isLoading ? (
            <div>
              {Array.from({ length: 16 }, (_, i) => (
                <div key={i} className="grid grid-cols-4 items-center border-b border-border px-3 py-2.5">
                  <div className="h-3.5 w-16 animate-pulse rounded bg-slate-300/80 dark:bg-slate-600/70" />
                  <div className="mx-auto h-3 w-10 animate-pulse rounded bg-slate-300/70 dark:bg-slate-600/60" />
                  <div className="mx-auto h-3 w-10 animate-pulse rounded bg-slate-300/70 dark:bg-slate-600/60" />
                  <div className="ml-auto h-3.5 w-14 animate-pulse rounded bg-slate-300/80 dark:bg-slate-600/70" />
                </div>
              ))}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No strikes available. Select an expiry to load the chain.
            </div>
          ) : (
            <div>
              {canLoadMoreTop && (
                <div
                  className="cursor-pointer border-b border-border bg-background py-2.5 text-center text-xs font-semibold text-primary transition-colors hover:bg-primary/5 hover:text-primary/80"
                  onClick={() => setVisibleRadius((r) => r + 5)}
                >
                  Load 5 more strikes
                </div>
              )}

              {rowsWithDisplay.map(({ row, ceLtp, peLtp }) => {
                const isAtm = derivedAtm !== null && row.strike === derivedAtm;
                const activeSymbol = mobileLeg === "CE" ? row.ce?.symbol : row.pe?.symbol;
                const isSelected = !!activeSymbol && selectedSymbol === activeSymbol;

                return (
                  <button
                    key={row.strike}
                    type="button"
                    className={cn(
                      "grid w-full grid-cols-4 items-center border-b border-border px-3 py-2.5 text-left transition-colors",
                      isAtm && "bg-primary/10",
                      isSelected && "bg-primary/12 ring-1 ring-inset ring-primary/30",
                    )}
                    onClick={() => {
                      if (activeSymbol) onSelectSymbol(activeSymbol);
                    }}
                  >
                    {mobileLeg === "CE" ? (
                      <>
                        <span
                          className={cn(
                            "text-[16px] font-semibold tabular-nums text-foreground",
                            flashMap[row.ce?.symbol || ""] === "up" && "text-emerald-500",
                            flashMap[row.ce?.symbol || ""] === "down" && "text-rose-500",
                          )}
                        >
                          {fmtLtp(ceLtp)}
                        </span>
                        <span className="text-center text-[12px] tabular-nums text-muted-foreground">
                          {fmtOI(Number(row.ce?.oi ?? 0))}
                        </span>
                        <span className="text-center text-[12px] tabular-nums text-muted-foreground">
                          {fmtOI(Number(row.ce?.volume ?? 0))}
                        </span>
                        <span className={cn("text-right text-[16px] font-bold tabular-nums", isAtm ? "text-primary" : "text-foreground")}>
                          {isAtm && <span className="mr-1 rounded bg-primary px-1 py-0.5 text-[9px] font-bold text-primary-foreground">ATM</span>}
                          {row.strike.toLocaleString("en-IN")}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={cn("text-[16px] font-bold tabular-nums", isAtm ? "text-primary" : "text-foreground")}>
                          {isAtm && <span className="mr-1 rounded bg-primary px-1 py-0.5 text-[9px] font-bold text-primary-foreground">ATM</span>}
                          {row.strike.toLocaleString("en-IN")}
                        </span>
                        <span
                          className={cn(
                            "text-center text-[16px] font-semibold tabular-nums text-foreground",
                            flashMap[row.pe?.symbol || ""] === "up" && "text-emerald-500",
                            flashMap[row.pe?.symbol || ""] === "down" && "text-rose-500",
                          )}
                        >
                          {fmtLtp(peLtp)}
                        </span>
                        <span className="text-center text-[12px] tabular-nums text-muted-foreground">
                          {fmtOI(Number(row.pe?.oi ?? 0))}
                        </span>
                        <span className="text-right text-[12px] tabular-nums text-muted-foreground">
                          {fmtOI(Number(row.pe?.volume ?? 0))}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}

              {canLoadMoreBottom && (
                <div
                  className="cursor-pointer border-t border-border bg-background py-2.5 text-center text-xs font-semibold text-primary transition-colors hover:bg-primary/5 hover:text-primary/80"
                  onClick={() => setVisibleRadius((r) => r + 5)}
                >
                  Load 5 more strikes
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <div className="flex min-h-[30px] items-center justify-between px-4 py-1.5">
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="font-semibold tracking-wide text-emerald-500 dark:text-emerald-300">CALLS</span>
              <span className="mx-2 text-border">|</span>
              <span className="font-semibold tracking-wide text-rose-500 dark:text-rose-300">PUTS</span>
            </div>
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Option Chain</span>
          </div>

          <div className="grid grid-cols-[1fr_108px_1fr] border-t border-border bg-muted/35 text-[11px] font-semibold">
            <div className="grid grid-cols-3 px-4 py-2 text-right">
              <span className="col-start-1 text-emerald-500 dark:text-emerald-300">LTP</span>
              <span className="col-start-2 text-muted-foreground">OI</span>
              <span className="col-start-3 text-muted-foreground">VOL</span>
            </div>
            <div className="flex items-center justify-center border-x border-border/70 bg-muted/40 py-2 text-muted-foreground">
              STRIKE
            </div>
            <div className="grid grid-cols-3 px-4 py-2 text-left">
              <span className="col-start-1 text-rose-500 dark:text-rose-300">LTP</span>
              <span className="col-start-2 text-muted-foreground">OI</span>
              <span className="col-start-3 text-muted-foreground">VOL</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-background [scrollbar-color:rgba(148,163,184,.25)_transparent] [scrollbar-width:thin]">
          {mobileMode && (
            <div className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-1.5 text-[11px] text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-card/80">
              ATM:{" "}
              <span className="font-semibold text-primary">
                {derivedAtm ? derivedAtm.toLocaleString("en-IN") : "--"}
              </span>
              <span className="mx-2 text-border">|</span>
              Spot: <span className="font-semibold text-foreground">{fmtLtp(underlyingPrice)}</span>
            </div>
          )}

          {isLoading ? (
            <div>
              {Array.from({ length: 21 }, (_, i) => (
                <SkeletonRow key={i} i={i} total={21} />
              ))}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No strikes available. Select an expiry to load the chain.
            </div>
          ) : (
            <div>
              {canLoadMoreTop && (
                <div
                  className="cursor-pointer border-b border-border bg-background py-2.5 text-center text-xs font-semibold text-primary transition-colors hover:bg-primary/5 hover:text-primary/80"
                  onClick={() => setVisibleRadius((r) => r + 5)}
                >
                  Load 5 more strikes
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
                      selectedSymbol={selectedSymbol}
                      onSelectSymbol={onSelectSymbol}
                      ceFlash={flashMap[row.ce?.symbol || ""]}
                      peFlash={flashMap[row.pe?.symbol || ""]}
                      rowRef={(el) => {
                        rowRefs.current[row.strike] = el;
                      }}
                    />
                    {mobileMode && isExpanded && (
                      <div className="grid grid-cols-2 border-b border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
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
                  className="cursor-pointer border-t border-border bg-background py-2.5 text-center text-xs font-semibold text-primary transition-colors hover:bg-primary/5 hover:text-primary/80"
                  onClick={() => setVisibleRadius((r) => r + 5)}
                >
                  Load 5 more strikes
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
