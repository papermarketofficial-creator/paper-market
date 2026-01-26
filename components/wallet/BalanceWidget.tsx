"use client";

import { useWalletStore } from '@/stores/wallet.store';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, Info } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

export const BalanceWidget = () => {
    const { balance, blockedBalance, availableBalance, isLoadingBalance } = useWalletStore();

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(value);
    };

    if (isLoadingBalance && balance === 0) {
        return <Skeleton className="h-24 w-full" />;
    }

    return (
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                <Wallet className="h-4 w-4" />
                <span className="text-sm font-medium">Wallet Balance</span>
            </div>

            <div className="space-y-3">
                {/* Available Balance - Prominent */}
                <div>
                    <p className="text-xs text-muted-foreground mb-1">Available to Trade</p>
                    <p className="text-2xl font-bold text-success">
                        {formatCurrency(availableBalance)}
                    </p>
                </div>

                {/* Separator */}
                <div className="border-t border-border/50" />

                {/* Breakdown */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <p className="text-xs text-muted-foreground">Total Funds</p>
                        <p className="font-medium">{formatCurrency(balance)}</p>
                    </div>

                    <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-xs text-muted-foreground">Blocked Funds</p>
                            {blockedBalance > 0 && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Info className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Funds reserved for active orders (margin)</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </div>
                        <p className={`font-medium ${blockedBalance > 0 ? 'text-orange-500' : ''}`}>
                            {formatCurrency(blockedBalance)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
