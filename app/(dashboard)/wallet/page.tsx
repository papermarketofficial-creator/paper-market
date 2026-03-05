"use client";

import { useEffect, useState } from "react";
import { useWalletStore } from "@/stores/wallet.store";
import { BalanceWidget } from "@/components/wallet/BalanceWidget";
import { TransactionTable } from "@/components/wallet/TransactionTable";
import { TransactionFilterBar } from "@/components/wallet/TransactionFilterBar";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download } from "lucide-react";

export default function WalletPage() {
    const {
        fetchWallet,
        fetchTransactions,
        transactions,
        transactionsPagination,
        isLoadingTransactions
    } = useWalletStore();

    const [filters, setFilters] = useState({});

    useEffect(() => {
        // fetchWallet(); // Handled by layout
        fetchTransactions({ page: 1, limit: 20 });
    }, [fetchTransactions]);

    const handleFilterChange = (newFilters: any) => {
        setFilters(newFilters);
        fetchTransactions(newFilters);
    };

    const handlePageChange = (newPage: number) => {
        const updatedFilters = { ...filters, page: newPage };
        setFilters(updatedFilters);
        fetchTransactions(updatedFilters);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Wallet & Transactions</h1>
                    <p className="text-muted-foreground">Manage your funds and view transaction history</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => fetchWallet()}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                    <Button variant="secondary" size="sm" disabled>
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Left Column: Balance Widget */}
                <div className="md:col-span-1">
                    <BalanceWidget />
                </div>

                {/* Right Column: Transaction History */}
                <div className="md:col-span-2 space-y-4">
                    <div className="bg-card rounded-xl border p-6">
                        <h2 className="text-lg font-semibold mb-4">Transaction History</h2>

                        <TransactionFilterBar
                            filters={filters}
                            onChange={handleFilterChange}
                        />

                        <TransactionTable
                            transactions={transactions}
                            isLoading={isLoadingTransactions}
                        />

                        {/* Simple Pagination */}
                        <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
                            <div>
                                Page {transactionsPagination.page} of {Math.ceil(transactionsPagination.total / transactionsPagination.limit)}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={transactionsPagination.page <= 1 || isLoadingTransactions}
                                    onClick={() => handlePageChange(transactionsPagination.page - 1)}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={transactionsPagination.page * transactionsPagination.limit >= transactionsPagination.total || isLoadingTransactions}
                                    onClick={() => handlePageChange(transactionsPagination.page + 1)}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
