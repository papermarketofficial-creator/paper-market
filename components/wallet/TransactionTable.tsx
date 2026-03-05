"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useWalletStore, Transaction } from "@/stores/wallet.store";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface TransactionTableProps {
    transactions: Transaction[];
    isLoading: boolean;
}

export const TransactionTable = ({ transactions, isLoading }: TransactionTableProps) => {
    const formatCurrency = (value: string | number) => {
        const num = typeof value === 'string' ? parseFloat(value) : value;
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2,
        }).format(num);
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'CREDIT': return 'bg-success/20 text-success border-success/30';
            case 'DEBIT': return 'bg-destructive/20 text-destructive border-destructive/30';
            case 'BLOCK': return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
            case 'UNBLOCK': return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
            case 'SETTLEMENT': return 'bg-purple-500/20 text-purple-500 border-purple-500/30';
            default: return 'bg-secondary text-secondary-foreground';
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                ))}
            </div>
        );
    }

    if (transactions.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground border rounded-lg bg-card/50">
                No transactions found
            </div>
        );
    }

    return (
        <div className="rounded-md border bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transactions.map((txn) => (
                        <TableRow key={txn.id}>
                            <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                {format(new Date(txn.createdAt), 'dd MMM yyyy HH:mm')}
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline" className={getTypeColor(txn.type)}>
                                    {txn.type}
                                </Badge>
                            </TableCell>
                            <TableCell className="max-w-[300px] truncate" title={txn.description || ''}>
                                {txn.description}
                                {txn.referenceType && (
                                    <span className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                        {txn.referenceType}
                                    </span>
                                )}
                            </TableCell>
                            <TableCell className={`text-right font-medium ${['CREDIT', 'UNBLOCK'].includes(txn.type) ? 'text-success' :
                                    txn.type === 'BLOCK' ? 'text-orange-500' : 'text-foreground'
                                }`}>
                                {['CREDIT', 'UNBLOCK'].includes(txn.type) ? '+' : '-'}
                                {formatCurrency(txn.amount)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                                {formatCurrency(txn.balanceAfter)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};
