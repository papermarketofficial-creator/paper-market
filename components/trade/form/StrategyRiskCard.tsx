"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
    findBreakevenPrices,
    type MultiLegPayoffPoint,
} from "@/lib/options/multi-leg-payoff";

type StrategyRiskCardProps = {
    payoffData: MultiLegPayoffPoint[];
    title?: string;
};

type DerivedRiskMetrics = {
    maxProfit: number;
    maxLoss: number;
    capitalRequired: number;
    riskRewardRatio: number | null;
    breakevens: number[];
};

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function formatMoney(value: number): string {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(value);
}

function deriveMetrics(data: MultiLegPayoffPoint[]): DerivedRiskMetrics {
    if (data.length === 0) {
        return {
            maxProfit: 0,
            maxLoss: 0,
            capitalRequired: 0,
            riskRewardRatio: null,
            breakevens: [],
        };
    }

    const pnl = data.map((point) => point.pnl);
    const maxProfit = Math.max(...pnl);
    const minPnl = Math.min(...pnl);
    const maxLoss = Math.abs(Math.min(0, minPnl));
    const capitalRequired = maxLoss;
    const riskRewardRatio =
        maxLoss > 0 ? round2(Math.max(0, maxProfit) / maxLoss) : null;

    return {
        maxProfit: round2(Math.max(0, maxProfit)),
        maxLoss: round2(maxLoss),
        capitalRequired: round2(capitalRequired),
        riskRewardRatio,
        breakevens: findBreakevenPrices(data),
    };
}

export function StrategyRiskCard({
    payoffData,
    title = "Strategy Risk Card",
}: StrategyRiskCardProps) {
    const metrics = useMemo(() => deriveMetrics(payoffData), [payoffData]);

    return (
        <div className="rounded border border-border p-3 h-full">
            <p className="text-sm font-semibold tracking-wide">{title}</p>

            <div className="mt-3 grid gap-3">
                <div className="rounded bg-muted/30 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Max Profit</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(metrics.maxProfit)}
                    </p>
                </div>

                <div className="rounded bg-muted/30 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Max Loss</p>
                    <p className="text-lg font-bold text-rose-600 dark:text-rose-400">
                        {formatMoney(metrics.maxLoss)}
                    </p>
                </div>

                <div className="rounded bg-muted/30 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Risk/Reward</p>
                    <p className="text-lg font-bold text-foreground">
                        {metrics.riskRewardRatio === null ? "N/A" : `1 : ${metrics.riskRewardRatio}`}
                    </p>
                </div>

                <div className="rounded bg-muted/30 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Capital Required</p>
                    <p className="text-lg font-bold text-foreground">
                        {formatMoney(metrics.capitalRequired)}
                    </p>
                </div>
            </div>

            <div className="mt-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Breakeven Points
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {metrics.breakevens.length > 0 ? (
                        metrics.breakevens.map((value) => (
                            <Badge key={`risk-be-${value}`} variant="outline" className="text-[10px]">
                                {value}
                            </Badge>
                        ))
                    ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                    )}
                </div>
            </div>
        </div>
    );
}
