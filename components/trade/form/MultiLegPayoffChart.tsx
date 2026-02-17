"use client";

import { useMemo } from "react";
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceDot,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import {
    findBreakevenPrices,
    generateMultiLegPayoffSeries,
    type MultiLegPayoffLeg,
    type MultiLegPayoffPoint,
} from "@/lib/options/multi-leg-payoff";
import { Badge } from "@/components/ui/badge";

type MultiLegPayoffChartProps = {
    legs: MultiLegPayoffLeg[];
    data?: MultiLegPayoffPoint[];
    breakevens?: number[];
    spotPrice?: number;
    title?: string;
    pointCount?: number;
    height?: number;
};

function formatCurrency(value: number): string {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(value);
}

function formatAxis(value: number): string {
    if (Math.abs(value) >= 100000) return `${Math.round(value / 1000)}k`;
    return `${Math.round(value)}`;
}

export function MultiLegPayoffChart({
    legs,
    data,
    breakevens: breakevenInput,
    spotPrice = 0,
    title = "Strategy Payoff at Expiry",
    pointCount = 160,
    height = 260,
}: MultiLegPayoffChartProps) {
    const chartData = useMemo(
        () => data ?? generateMultiLegPayoffSeries(legs, pointCount),
        [data, legs, pointCount]
    );

    const breakevens = useMemo(
        () => breakevenInput ?? findBreakevenPrices(chartData),
        [breakevenInput, chartData]
    );

    if (!legs.length || chartData.length === 0) {
        return (
            <div className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground">
                Select valid strategy legs to render payoff.
            </div>
        );
    }

    return (
        <div className="space-y-2 rounded border border-border p-3">
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{title}</p>
                <div className="flex flex-wrap items-center gap-2">
                    {breakevens.map((value) => (
                        <Badge key={`be-${value}`} variant="outline" className="text-[10px]">
                            BE {value}
                        </Badge>
                    ))}
                    {Number.isFinite(spotPrice) && spotPrice > 0 ? (
                        <Badge variant="secondary" className="text-[10px]">
                            Spot {spotPrice.toFixed(2)}
                        </Badge>
                    ) : null}
                </div>
            </div>

            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                            dataKey="price"
                            type="number"
                            domain={["dataMin", "dataMax"]}
                            tickFormatter={formatAxis}
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        />
                        <YAxis
                            tickFormatter={formatAxis}
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "hsl(var(--popover))",
                                borderColor: "hsl(var(--border))",
                                fontSize: "12px",
                            }}
                            formatter={(value: number) => [formatCurrency(value), "P&L"]}
                            labelFormatter={(label) => `Spot ${Number(label).toFixed(2)}`}
                        />

                        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />

                        {Number.isFinite(spotPrice) && spotPrice > 0 ? (
                            <ReferenceLine
                                x={spotPrice}
                                stroke="hsl(var(--primary))"
                                strokeDasharray="3 3"
                                label={{ value: "Spot", position: "top", fill: "hsl(var(--primary))", fontSize: 11 }}
                            />
                        ) : null}

                        {breakevens.map((value) => (
                            <ReferenceDot
                                key={`breakeven-dot-${value}`}
                                x={value}
                                y={0}
                                r={4}
                                fill="hsl(var(--primary))"
                                stroke="hsl(var(--background))"
                            />
                        ))}

                        <Line
                            type="monotone"
                            dataKey="pnl"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
