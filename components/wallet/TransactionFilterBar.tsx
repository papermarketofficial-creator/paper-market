"use client";

import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { TransactionFilters } from "@/stores/wallet.store";
import { X, Filter } from "lucide-react";

interface TransactionFiltersProps {
    filters: TransactionFilters;
    onChange: (filters: TransactionFilters) => void;
}

export const TransactionFilterBar = ({ filters, onChange }: TransactionFiltersProps) => {
    const handleTypeChange = (value: string) => {
        onChange({ ...filters, type: value === 'ALL' ? undefined : value as any, page: 1 });
    };

    const handleRefChange = (value: string) => {
        onChange({ ...filters, referenceType: value === 'ALL' ? undefined : value as any, page: 1 });
    };

    const clearFilters = () => {
        onChange({ page: 1, limit: 20 });
    };

    const hasActiveFilters = filters.type || filters.referenceType || filters.startDate;

    return (
        <div className="flex flex-wrap items-center gap-3 mb-6 bg-card p-3 rounded-lg border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mr-2">
                <Filter className="h-4 w-4" />
                <span>Filters:</span>
            </div>

            <Select value={filters.type || 'ALL'} onValueChange={handleTypeChange}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue placeholder="Transaction Type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">All Types</SelectItem>
                    <SelectItem value="CREDIT">Credit</SelectItem>
                    <SelectItem value="DEBIT">Debit</SelectItem>
                    <SelectItem value="BLOCK">Block (Margin)</SelectItem>
                    <SelectItem value="UNBLOCK">Unblock</SelectItem>
                    <SelectItem value="SETTLEMENT">Settlement</SelectItem>
                </SelectContent>
            </Select>

            <Select value={filters.referenceType || 'ALL'} onValueChange={handleRefChange}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue placeholder="Reference" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">All References</SelectItem>
                    <SelectItem value="ORDER">Order</SelectItem>
                    <SelectItem value="TRADE">Trade</SelectItem>
                    <SelectItem value="POSITION">Position</SelectItem>
                </SelectContent>
            </Select>

            {hasActiveFilters && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-8 text-xs text-muted-foreground hover:text-foreground ml-auto"
                >
                    <X className="h-3 w-3 mr-1" />
                    Clear API Filters
                </Button>
            )}
        </div>
    );
};
