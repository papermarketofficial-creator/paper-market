"use client";

import { useWalletStore } from '@/stores/wallet.store';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet } from 'lucide-react';

export const BalanceWidget = () => {
    const { balance, isLoadingBalance } = useWalletStore();

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
        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                <Wallet className="h-5 w-5" />
                <span className="text-sm font-medium">Wallet Balance</span>
            </div>

            <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Available to Trade</p>
                <p className="text-3xl font-bold text-success">
                    {formatCurrency(balance)}
                </p>
                <p className="text-xs text-muted-foreground pt-2">
                    Paper trading virtual funds
                </p>
            </div>
        </div>
    );
};
