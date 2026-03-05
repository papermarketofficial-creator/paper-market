'use client';
import { ReactNode, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/general/Logo';
import { CircleUserRound } from 'lucide-react';

import { useWalletStore } from '@/stores/wallet.store';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { useMarketStream } from '@/hooks/use-market-stream'; // New Hook
import { useMarketStore } from '@/stores/trading/market.store';
import { MarketStatusBar } from '@/components/layout/MarketStatusBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { cn } from '@/lib/utils';
import { toInstrumentKey } from '@/lib/market/symbol-normalization';

export default function DashboardLayoutClient({ children }: { children: ReactNode }) {
  

  useMarketStream();

  const fetchWallet = useWalletStore((state) => state.fetchWallet);
  const fetchPositions = usePositionsStore((state) => state.fetchPositions);

  useEffect(() => {
    fetchWallet();
    fetchPositions();
  }, [fetchWallet, fetchPositions]);

  return (
    <DashboardContentWrapper>
      {children}
    </DashboardContentWrapper>
  );
}



function DashboardContentWrapper({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const isEquityTradeRoute = pathname?.startsWith('/trade/equity');

  return (

    <div className="flex min-h-screen w-full bg-background text-foreground font-sans ">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
        compactHidden={isEquityTradeRoute}
        disableMobile={isEquityTradeRoute}
      />

      <div
        className={cn(
          'flex-1 flex flex-col transition-all duration-300',
          isEquityTradeRoute ? 'xl:ml-16' : 'md:ml-16',
        )}
      >
        <MobileFloatingHeader />
        <div className="hidden md:block">
          <MarketStatusBar />
        </div>

        <main className="flex-1 overflow-x-hidden w-full max-w-full pb-20 pt-20 md:pb-0 md:pt-0">
          {children}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  )
}

function MobileFloatingHeader() {
  const quotesByInstrument = useMarketStore((state) => state.quotesByInstrument);
  const selectQuote = useMarketStore((state) => state.selectQuote);

  const niftyKey = toInstrumentKey("NSE_INDEX|NIFTY 50");
  const bankNiftyKey = toInstrumentKey("NSE_INDEX|NIFTY BANK");

  const niftyQuote =
    quotesByInstrument[niftyKey] ||
    selectQuote(niftyKey) ||
    selectQuote("NIFTY 50");
  const bankNiftyQuote =
    quotesByInstrument[bankNiftyKey] ||
    selectQuote(bankNiftyKey) ||
    selectQuote("NIFTY BANK");

  const formatPrice = (value: number | undefined) =>
    Number.isFinite(Number(value)) && Number(value) > 0
      ? Number(value).toFixed(2)
      : "--";

  const formatChange = (value: number | undefined) => {
    if (!Number.isFinite(Number(value))) return "--";
    const safe = Number(value);
    const sign = safe > 0 ? "+" : "";
    return `${sign}${safe.toFixed(2)}%`;
  };

  return (
    <div className="fixed left-2 right-2 top-2 z-50 md:hidden">
      <div className="relative flex items-center gap-2 rounded-2xl border border-border/80 bg-background/90 px-2.5 py-1.5 backdrop-blur dark:border-[#1a2e4f] dark:bg-[#0b172b]/88">
        <Link
          href="/dashboard"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted/70 dark:hover:bg-white/[0.06]"
          aria-label="Open dashboard"
        >
          <Logo hideText className="scale-[0.62]" />
        </Link>

        <span className="h-6 w-px shrink-0 bg-border/80 dark:bg-[#1a2e4f]" />

        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <p className="truncate text-[9px] uppercase tracking-[0.08em] text-muted-foreground dark:text-slate-400">NIFTY</p>
              <p className="truncate text-[11px] font-semibold text-foreground dark:text-slate-100">{formatPrice(niftyQuote?.price)}</p>
              <p
                className={cn(
                  "truncate text-[9px]",
                  Number(niftyQuote?.changePercent || 0) >= 0
                    ? "text-emerald-600 dark:text-[#2dd4bf]"
                    : "text-rose-600 dark:text-[#fb7185]"
                )}
              >
                {formatChange(niftyQuote?.changePercent)}
              </p>
            </div>
            <div className="min-w-0 border-l border-border/80 pl-2 dark:border-[#1a2e4f]">
              <p className="truncate text-[9px] uppercase tracking-[0.08em] text-muted-foreground dark:text-slate-400">BANKNIFTY</p>
              <p className="truncate text-[11px] font-semibold text-foreground dark:text-slate-100">{formatPrice(bankNiftyQuote?.price)}</p>
              <p
                className={cn(
                  "truncate text-[9px]",
                  Number(bankNiftyQuote?.changePercent || 0) >= 0
                    ? "text-emerald-600 dark:text-[#2dd4bf]"
                    : "text-rose-600 dark:text-[#fb7185]"
                )}
              >
                {formatChange(bankNiftyQuote?.changePercent)}
              </p>
            </div>
          </div>
        </div>

        <span className="h-6 w-px shrink-0 bg-border/80 dark:bg-[#1a2e4f]" />

        <Link
          href="/profile"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted/70 dark:hover:bg-white/[0.06]"
          aria-label="Open profile"
        >
          <CircleUserRound className="h-5 w-5 text-foreground dark:text-slate-100" />
        </Link>
      </div>
    </div>
  );
}
