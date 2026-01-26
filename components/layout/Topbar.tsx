import { cn } from '@/lib/utils';
import { useWalletStore } from '@/stores/wallet.store';
import { usePositionsStore } from '@/stores/trading/positions.store';
import { useOrdersStore } from '@/stores/trading/orders.store';
import { useEffect } from 'react';

interface TopbarProps {
  onMobileMenuToggle?: () => void;
  mobileMenuOpen?: boolean;
}

export function Topbar({ onMobileMenuToggle, mobileMenuOpen = false }: TopbarProps) {
  // Use real wallet balance from API
  const { balance, blockedBalance, availableBalance, fetchWallet, isLoadingBalance } = useWalletStore();
  const positions = usePositionsStore((state) => state.positions);
  const trades = useOrdersStore((state) => state.trades);

  // Fetch wallet on mount and poll every 5 seconds
  useEffect(() => {
    fetchWallet(); // Initial fetch

    const interval = setInterval(() => {
      fetchWallet();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [fetchWallet]);

  const openPnL = positions.reduce((acc, pos) => {
    const pnl = pos.side === 'BUY'
      ? (pos.currentPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - pos.currentPrice) * pos.quantity;
    return acc + pnl;
  }, 0);

  const closedPnL = trades.reduce((acc, trade) => acc + (trade.pnl || 0), 0);
  const totalPnL = openPnL + closedPnL;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
      {/* Mobile Menu Button & Logo */}
      <div className="flex items-center gap-3 md:hidden">
        <button
          onClick={onMobileMenuToggle}
          className="flex h-10 w-10 flex-col items-center justify-center gap-[6px] rounded-full bg-secondary/50 transition-all active:scale-90"
          aria-label="Toggle menu"
        >
          <span
            className={cn(
              "h-[2px] w-5 rounded-full bg-foreground transition-all duration-300 origin-left",
              mobileMenuOpen && "rotate-45 w-6 translate-y-[0px]"
            )}
          />
          <span
            className={cn(
              "h-[2px] w-3 rounded-full bg-foreground transition-all duration-300 origin-left self-start ml-[10px]",
              mobileMenuOpen && "-rotate-45 w-6 ml-0"
            )}
          />
        </button>
        <div className="font-bold text-lg tracking-tight flex items-center gap-1">
          <span className="text-primary">Paper</span>Market
        </div>
      </div>

      {/* Balance & P&L */}
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="hidden sm:block">
          <p className="text-xs text-muted-foreground">Available Balance</p>
          <p className={cn(
            "text-base sm:text-lg font-semibold animate-number",
            isLoadingBalance && "opacity-50"
          )}>
            {formatCurrency(availableBalance)}
            {blockedBalance > 0 && (
              <span className="text-xs text-muted-foreground ml-2" title={`₹${blockedBalance.toLocaleString()} blocked`}>
                (₹{blockedBalance.toLocaleString()} blocked)
              </span>
            )}
          </p>
        </div>

        <div className="hidden sm:block h-8 w-px bg-border" />

        <div>
          <p className="text-xs text-muted-foreground">Total P&L</p>
          <p className={cn(
            'text-base sm:text-lg font-semibold animate-number',
            totalPnL >= 0 ? 'text-profit' : 'text-loss'
          )}>
            {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
          </p>
        </div>
      </div>


    </header>
  );
}
