"use client";
import { useEffect } from "react";
import { useWalletStore } from "@/stores/wallet.store";
import { TransactionHistory } from "@/components/wallet/TransactionHistory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, TrendingUp, Lock } from "lucide-react";

export default function TransactionsPage() {
    const { balance, blockedBalance, availableBalance, fetchWallet, fetchTransactions } = useWalletStore();

    useEffect(() => {
        // fetchWallet(); // Handled by layout
        fetchTransactions({ limit: 20, page: 1 });
    }, [fetchTransactions]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2,
        }).format(value);
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Wallet Transactions</h1>
                <p className="text-muted-foreground mt-2">
                    Complete transaction history and balance overview
                </p>
            </div>

            {/* Balance Overview Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(balance)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Your total wallet balance
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
                        <TrendingUp className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{formatCurrency(availableBalance)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Ready to use for trading
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Blocked Balance</CardTitle>
                        <Lock className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">{formatCurrency(blockedBalance)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Reserved for open orders
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Transaction History */}
            <TransactionHistory />
        </div>
    );
}
