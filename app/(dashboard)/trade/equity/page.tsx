"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { EquityTradeForm } from "@/components/trade/EquityTradeForm";
import { Stock } from "@/types/equity.types";
import { useMarketStore } from "@/stores/trading/market.store";
import { useWalletStore } from "@/stores/wallet.store";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GlobalSearchModal } from "@/components/trade/search/GlobalSearchModal";
import { WatchlistPanel } from "@/components/trade/watchlist/WatchlistPanel";
import { AdaptiveTradeLayout } from "@/components/trade/layout/AdaptiveTradeLayout";
import { useTradeViewport } from "@/hooks/use-trade-viewport";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, Search } from "lucide-react";

const CandlestickChartComponent = dynamic(
  () => import("@/components/trade/CandlestickChart").then((mod) => ({ default: mod.CandlestickChart })),
  { ssr: false },
);

function formatBalance(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return `INR ${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatPrice(value?: number): string {
  if (!Number.isFinite(value) || Number(value) <= 0) return "--";
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatChangePercent(value?: number): string {
  if (!Number.isFinite(value)) return "--";
  const v = Number(value);
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export default function EquityPage() {
  const { isMobile, isDesktop } = useTradeViewport();
  const router = useRouter();
  const { data: session } = useSession();
  const { getCurrentInstruments, stocksBySymbol } = useMarketStore();
  const walletBalance = useWalletStore((state) => state.balance);

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [mobileOrderOpen, setMobileOrderOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"watchlist" | "chart">("watchlist");

  const currentInstruments = getCurrentInstruments("equity");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedFallback, setSelectedFallback] = useState<Stock | null>(null);

  const selectedStock = useMemo(() => {
    if (!selectedSymbol) return null;
    return stocksBySymbol[selectedSymbol] || selectedFallback;
  }, [selectedSymbol, selectedFallback, stocksBySymbol]);

  useEffect(() => {
    if (selectedSymbol) return;
    if (currentInstruments.length === 0) return;
    if (isMobile) return;

    const first = currentInstruments[0];
    setSelectedSymbol(first.symbol);
    setSelectedFallback(first);
  }, [currentInstruments, isMobile, selectedSymbol]);

  useEffect(() => {
    if (!selectedSymbol) return;
    if (!stocksBySymbol[selectedSymbol]) return;
    if (selectedFallback?.symbol !== selectedSymbol) return;
    setSelectedFallback(null);
  }, [selectedSymbol, selectedFallback, stocksBySymbol]);

  useEffect(() => {
    (window as any).triggerTrade = (_side: "BUY" | "SELL") => {
      if (isMobile) {
        setMobileOrderOpen(true);
        return;
      }
      setShowOrderForm(true);
    };
    return () => {
      (window as any).triggerTrade = undefined;
    };
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) setMobilePanel("watchlist");
  }, [isMobile]);

  const handleSelectStock = (stock: Stock) => {
    setSelectedSymbol(stock.symbol);
    setSelectedFallback(stock);
    if (isMobile) setMobilePanel("chart");
  };

  const navigateFromProfile = (path: string) => {
    router.push(path);
  };

  const chartNode = (
    <div className="h-full w-full bg-card/50">
      {selectedSymbol ? (
        <Suspense fallback={<Skeleton className="h-full w-full" />}>
          <div className="h-full w-full">
            <CandlestickChartComponent
              symbol={selectedSymbol}
              instrumentKey={selectedStock?.instrumentToken}
              onSearchClick={() => setSearchModalOpen(true)}
            />
          </div>
        </Suspense>
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground">Select a stock to view chart</div>
      )}
    </div>
  );

  const watchlistNode = (
    <div className="h-full">
      <WatchlistPanel
        instruments={currentInstruments}
        selectedSymbol={selectedSymbol ?? undefined}
        onSelect={handleSelectStock}
        onOpenSearch={() => setSearchModalOpen(true)}
      />
    </div>
  );

  const orderPanelNode = selectedStock ? (
    <div className="h-full min-h-0 overflow-y-auto">
      <EquityTradeForm selectedStock={selectedStock} onStockSelect={handleSelectStock} instruments={currentInstruments} sheetMode />
    </div>
  ) : (
    <div className="flex h-full items-center justify-center p-4 text-xs text-slate-500">Select a stock to place an order.</div>
  );

  const tabletWatchlistNode = (
    <div className="h-full min-h-0 overflow-hidden bg-background p-2">
      <div className="h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
        <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Watchlist
        </div>
        <div className="h-[calc(100%-37px)] min-h-0 overflow-hidden">{watchlistNode}</div>
      </div>
    </div>
  );

  const tabletOrderNode = (
    <div className="h-full min-h-0 overflow-hidden bg-background p-2">
      <div className="h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
        <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Order Ticket
        </div>
        <div className="h-[calc(100%-37px)] min-h-0 overflow-hidden">{orderPanelNode}</div>
      </div>
    </div>
  );

  const mobileChartNode = (
    <div className="h-full min-h-0 bg-background p-2 pb-3">
      <div className="h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-[0_10px_28px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_35px_rgba(0,0,0,0.3)]">
        {chartNode}
      </div>
    </div>
  );

  const mobileWatchlistNode = (
    <div className="h-full min-h-0 bg-background p-2 pb-3">
      <div className="h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-[0_10px_28px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_35px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Watchlist</p>
            <p className="text-[11px] text-muted-foreground/80">Tap any stock to open chart</p>
          </div>
          <button
            type="button"
            onClick={() => setSearchModalOpen(true)}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background/80 px-2.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Search className="h-3.5 w-3.5" />
            Search
          </button>
        </div>
        <div className="h-[calc(100%-56px)] min-h-0 overflow-hidden">{watchlistNode}</div>
      </div>
    </div>
  );

  const mobileChartNodeWithHeader = (
    <div className="h-full min-h-0 bg-background p-2 pb-3">
      <div className="h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-[0_10px_28px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_35px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <button
            type="button"
            onClick={() => setMobilePanel("watchlist")}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background/80 px-2 text-xs font-medium text-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Watchlist
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => (window as any).triggerTrade?.("BUY")}
              className="h-7 rounded bg-emerald-600 px-3 text-[10px] uppercase font-bold text-white shadow"
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => (window as any).triggerTrade?.("SELL")}
              className="h-7 rounded bg-rose-600 px-3 text-[10px] uppercase font-bold text-white shadow"
            >
              Sell
            </button>
          </div>
        </div>
        <div className="h-[calc(100%-49px)] min-h-0 overflow-hidden">{chartNode}</div>
      </div>
    </div>
  );

  const mobileMainNode = mobilePanel === "watchlist" ? mobileWatchlistNode : mobileChartNodeWithHeader;

  // Removed mobileTopBarNode as per user request

  const mobileOrderDrawerNode = (
    <div className="h-[86vh] min-h-0 overflow-hidden bg-background">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Order Ticket</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{selectedStock?.symbol || "EQUITY"}</p>
      </div>
      <div className="h-[calc(100%-62px)] min-h-0 overflow-y-auto">{orderPanelNode}</div>
    </div>
  );

  return (
    <>
      <GlobalSearchModal
        open={searchModalOpen}
        onOpenChange={setSearchModalOpen}
        onSelectStock={(stock) => {
          handleSelectStock(stock);
          setSearchModalOpen(false);
        }}
      />

      <div className="h-[calc(100dvh-6rem)] md:h-[calc(100vh-2rem)] min-h-0 overflow-hidden">
        <AdaptiveTradeLayout
          desktopLeft={watchlistNode}
          desktopLeftWidth="360px"
          desktopCenter={
            <div className="relative h-full min-h-0">
              {chartNode}
              {isDesktop && showOrderForm && selectedStock && selectedSymbol ? (
                <div className="absolute right-4 top-16 z-50 w-[340px] animate-in fade-in slide-in-from-right-8 duration-200">
                  <div className="relative rounded-lg border border-border bg-card shadow-2xl">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 z-10 h-7 w-7 rounded-full bg-background/70 hover:bg-background"
                      onClick={() => setShowOrderForm(false)}
                    >
                      <span className="sr-only">Close</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-x"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </Button>
                    <div className="h-auto max-h-[80vh] overflow-y-auto rounded-lg">
                      <EquityTradeForm
                        selectedStock={selectedStock}
                        onStockSelect={handleSelectStock}
                        instruments={currentInstruments}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          }
          tabletTop={mobileChartNode}
          tabletLeft={tabletWatchlistNode}
          tabletRight={tabletOrderNode}
          mobileContent={mobileMainNode}
          mobileOrderOpen={mobileOrderOpen}
          onMobileOrderOpenChange={setMobileOrderOpen}
          mobileOrderDrawer={mobileOrderDrawerNode}
        />
      </div>
    </>
  );
}

