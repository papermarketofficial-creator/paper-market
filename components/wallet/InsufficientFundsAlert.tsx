"use client";

import { useWalletStore } from '@/stores/wallet.store';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface InsufficientFundsAlertProps {
    requiredAmount: number;
}

export const InsufficientFundsAlert = ({ requiredAmount }: InsufficientFundsAlertProps) => {
    const { availableBalance } = useWalletStore();
    const shortfall = requiredAmount - availableBalance;

    if (requiredAmount <= availableBalance) return null;

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(value);
    };

    return (
        <Alert variant="destructive" className="mt-4 border-red-500/50 bg-red-500/10">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Insufficient Funds</AlertTitle>
            <AlertDescription className="mt-2 space-y-3">
                <div className="flex justify-between text-sm">
                    <span>Required Margin:</span>
                    <span className="font-medium">{formatCurrency(requiredAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span>Available Balance:</span>
                    <span className="font-medium">{formatCurrency(availableBalance)}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-red-500/30 font-bold">
                    <span>Shortfall:</span>
                    <span>{formatCurrency(shortfall)}</span>
                </div>

                <div className="pt-2 text-xs opacity-90">
                    Tip: Reduce order quantity or close existing positions to free up margin.
                </div>

                <Link href="/wallet" className="block w-full">
                    <Button variant="outline" size="sm" className="w-full border-red-500/30 hover:bg-red-500/20 text-red-500 hover:text-red-400">
                        Manage Wallet
                        <ArrowRight className="ml-2 h-3 w-3" />
                    </Button>
                </Link>
            </AlertDescription>
        </Alert>
    );
};
