"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

type AccountState = "NORMAL" | "MARGIN_STRESSED" | "LIQUIDATING";
type RiskLevel = "LOW" | "MODERATE" | "HIGH";

type PostTradeRiskPreviewProps = {
    projectedAdditionalMargin: number;
    equity: number;
    blockedMargin: number;
    accountState: AccountState;
    title?: string;
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(value);
}

function resolveRiskLevel(accountState: AccountState, marginUsedPct: number): RiskLevel {
    if (accountState === "LIQUIDATING" || marginUsedPct >= 85) return "HIGH";
    if (accountState === "MARGIN_STRESSED" || marginUsedPct >= 60) return "MODERATE";
    return "LOW";
}

export function PostTradeRiskPreview({
    projectedAdditionalMargin,
    equity,
    blockedMargin,
    accountState,
    title = "Post-Trade Risk Preview",
}: PostTradeRiskPreviewProps) {
    const projected = useMemo(() => {
        const safeEquity = Math.max(0, Number.isFinite(equity) ? equity : 0);
        const safeBlocked = Math.max(0, Number.isFinite(blockedMargin) ? blockedMargin : 0);
        const safeAdditional = Math.max(
            0,
            Number.isFinite(projectedAdditionalMargin) ? projectedAdditionalMargin : 0
        );

        const projectedBlocked = safeBlocked + safeAdditional;
        const marginUsedPct = safeEquity > 0 ? (projectedBlocked / safeEquity) * 100 : 0;
        const liquidationBuffer = safeEquity - projectedBlocked;
        const riskLevel = resolveRiskLevel(accountState, marginUsedPct);

        return {
            projectedEquity: safeEquity,
            marginUsedPct: clamp(marginUsedPct, 0, 999),
            liquidationBuffer,
            riskLevel,
        };
    }, [accountState, blockedMargin, equity, projectedAdditionalMargin]);

    return (
        <div className="rounded-sm border border-border bg-muted/20 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>

            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Margin Used</p>
                    <p className="text-xs font-semibold text-foreground">
                        {projected.marginUsedPct.toFixed(1)}%
                    </p>
                </div>

                <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Equity</p>
                    <p className="text-xs font-semibold text-foreground">
                        {formatCurrency(projected.projectedEquity)}
                    </p>
                </div>

                <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Liquidation Buffer
                    </p>
                    <p
                        className={cn(
                            "text-xs font-semibold",
                            projected.liquidationBuffer < 0
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-foreground"
                        )}
                    >
                        {formatCurrency(projected.liquidationBuffer)}
                    </p>
                </div>

                <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Risk Level</p>
                    <p
                        className={cn(
                            "text-xs font-semibold",
                            projected.riskLevel === "HIGH"
                                ? "text-rose-600 dark:text-rose-400"
                                : projected.riskLevel === "MODERATE"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-emerald-600 dark:text-emerald-400"
                        )}
                    >
                        {projected.riskLevel}
                    </p>
                </div>
            </div>
        </div>
    );
}
