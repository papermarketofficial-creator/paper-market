"use client";
import { useState } from "react";
import { useWalletStore, type Transaction } from "@/stores/wallet.store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ArrowDownIcon, ArrowUpIcon, LockIcon, UnlockIcon, RefreshCwIcon } from "lucide-react";

interface TransactionHistoryProps {
    className?: string;
}

export function TransactionHistory({ className }: TransactionHistoryProps) {
    const { transactions, isLoadingTransactions, fetchTransactions, transactionsPagination } = useWalletStore();
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [currentPage, setCurrentPage] = useState(1);

    const handleFilterChange = (type: string) => {
        setTypeFilter(type);
        setCurrentPage(1);

        fetchTransactions({
            type: type === "all" ? undefined : type as any,
            page: 1,
            limit: 20,
        });
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        fetchTransactions({
            type: typeFilter === "all" ? undefined : typeFilter as any,
            page,
            limit: 20,
        });
    };

    const getTransactionIcon = (type: Transaction["type"]) => {
        switch (type) {
            case "CREDIT":
                return <ArrowDownIcon className="h-4 w-4 text-green-600" />;
            case "DEBIT":
            case "SETTLEMENT":
                return <ArrowUpIcon className="h-4 w-4 text-red-600" />;
            case "BLOCK":
                return <LockIcon className="h-4 w-4 text-orange-600" />;
            case "UNBLOCK":
                return <UnlockIcon className="h-4 w-4 text-blue-600" />;
            default:
                return <RefreshCwIcon className="h-4 w-4" />;
        }
    };

    const getTransactionBadgeVariant = (type: Transaction["type"]) => {
        switch (type) {
            case "CREDIT":
                return "default";
            case "DEBIT":
            case "SETTLEMENT":
                return "destructive";
            case "BLOCK":
                return "secondary";
            case "UNBLOCK":
                return "outline";
            default:
                return "outline";
        }
    };

    const formatAmount = (amount: string, type: Transaction["type"]) => {
        const value = parseFloat(amount);
        const formatted = new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2,
        }).format(value);

        if (type === "CREDIT" || type === "UNBLOCK") {
            return <span className="text-green-600 font-semibold">+{formatted}</span>;
        } else {
            return <span className="text-red-600 font-semibold">-{formatted}</span>;
        }
    };

    const formatDate = (date: Date) => {
        return new Intl.DateTimeFormat('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    };

    return (
        <Card className={cn("w-full", className)}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Transaction History</CardTitle>
                        <CardDescription>Complete ledger of all wallet transactions</CardDescription>
                    </div>

                    <Select value={typeFilter} onValueChange={handleFilterChange}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter by type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Transactions</SelectItem>
                            <SelectItem value="CREDIT">Credits</SelectItem>
                            <SelectItem value="DEBIT">Debits</SelectItem>
                            <SelectItem value="BLOCK">Blocked</SelectItem>
                            <SelectItem value="UNBLOCK">Unblocked</SelectItem>
                            <SelectItem value="SETTLEMENT">Settlements</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>

            <CardContent>
                {isLoadingTransactions ? (
                    <div className="flex items-center justify-center py-8">
                        <RefreshCwIcon className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-muted-foreground">Loading transactions...</span>
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        No transactions found
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            {transactions.map((txn) => (
                                <div
                                    key={txn.id}
                                    className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                                            {getTransactionIcon(txn.type)}
                                        </div>

                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant={getTransactionBadgeVariant(txn.type)}>
                                                    {txn.type}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatDate(txn.createdAt)}
                                                </span>
                                            </div>
                                            <p className="text-sm text-muted-foreground line-clamp-1">
                                                {txn.description || `${txn.type} transaction`}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <div className="mb-1">
                                            {formatAmount(txn.amount, txn.type)}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            Balance: ₹{parseFloat(txn.balanceAfter).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        {transactionsPagination.total > transactionsPagination.limit && (
                            <div className="flex items-center justify-between mt-6 pt-4 border-t">
                                <div className="text-sm text-muted-foreground">
                                    Page {transactionsPagination.page} of {Math.ceil(transactionsPagination.total / transactionsPagination.limit)}
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handlePageChange(currentPage - 1)}
                                        disabled={currentPage === 1}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handlePageChange(currentPage + 1)}
                                        disabled={currentPage >= Math.ceil(transactionsPagination.total / transactionsPagination.limit)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
