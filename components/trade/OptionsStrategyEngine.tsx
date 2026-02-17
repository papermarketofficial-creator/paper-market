"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Stock } from "@/types/equity.types";
import { useTradeExecutionStore } from "@/stores/trading/tradeExecution.store";
import { useWalletStore } from "@/stores/wallet.store";
import { useMarketStore } from "@/stores/trading/market.store";
import { MultiLegPayoffChart } from "@/components/trade/form/MultiLegPayoffChart";
import { StrategyRiskCard } from "@/components/trade/form/StrategyRiskCard";
import { PostTradeRiskPreview } from "@/components/trade/form/PostTradeRiskPreview";
import {
    findBreakevenPrices,
    generateMultiLegPayoffSeries,
    type MultiLegPayoffLeg,
    type MultiLegPayoffPoint,
} from "@/lib/options/multi-leg-payoff";

type StrategyType =
    | "STRADDLE"
    | "STRANGLE"
    | "IRON_CONDOR"
    | "BULL_CALL_SPREAD"
    | "BEAR_PUT_SPREAD";

type StrategyPayload =
    | {
          strategy: "STRADDLE";
          underlying: string;
          expiry: string;
          lots: number;
          strikes: { centerStrike: number };
      }
    | {
          strategy: "STRANGLE";
          underlying: string;
          expiry: string;
          lots: number;
          strikes: { putStrike: number; callStrike: number };
      }
    | {
          strategy: "IRON_CONDOR";
          underlying: string;
          expiry: string;
          lots: number;
          strikes: {
              putLongStrike: number;
              putShortStrike: number;
              callShortStrike: number;
              callLongStrike: number;
          };
      }
    | {
          strategy: "BULL_CALL_SPREAD";
          underlying: string;
          expiry: string;
          lots: number;
          strikes: { longCallStrike: number; shortCallStrike: number };
      }
    | {
          strategy: "BEAR_PUT_SPREAD";
          underlying: string;
          expiry: string;
          lots: number;
          strikes: { longPutStrike: number; shortPutStrike: number };
      };

type PreviewResponse = {
    strategy: StrategyType;
    underlying: string;
    expiry: string;
    lots: number;
    legs: Array<{
        role: string;
        side: "BUY" | "SELL";
        optionType: "CE" | "PE";
        strike: number;
        instrumentToken: string;
        symbol: string;
        lotSize: number;
        quantity: number;
        ltp: number;
        premium: number;
    }>;
    summary: {
        totalPremium: number;
        premiumType: "DEBIT" | "CREDIT";
        requiredMargin: number;
        maxProfit: number | null;
        maxLoss: number | null;
        breakevens: number[];
    };
};

type Props = {
    underlying: string;
    instruments: Stock[];
};

type StrikeForm = {
    centerStrike: string;
    putStrike: string;
    callStrike: string;
    putLongStrike: string;
    putShortStrike: string;
    callShortStrike: string;
    callLongStrike: string;
    longCallStrike: string;
    shortCallStrike: string;
    longPutStrike: string;
    shortPutStrike: string;
};

const STRATEGY_LABELS: Record<StrategyType, string> = {
    STRADDLE: "Straddle",
    STRANGLE: "Strangle",
    IRON_CONDOR: "Iron Condor",
    BULL_CALL_SPREAD: "Bull Call Spread",
    BEAR_PUT_SPREAD: "Bear Put Spread",
};

const EMPTY_STRIKES: StrikeForm = {
    centerStrike: "",
    putStrike: "",
    callStrike: "",
    putLongStrike: "",
    putShortStrike: "",
    callShortStrike: "",
    callLongStrike: "",
    longCallStrike: "",
    shortCallStrike: "",
    longPutStrike: "",
    shortPutStrike: "",
};

function toDateKey(raw: Date | string | undefined): string {
    if (!raw) return "";
    const date = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
}

function formatMoney(value: number): string {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    }).format(value);
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function estimateCapitalFromPayoff(data: MultiLegPayoffPoint[]): number {
    if (data.length === 0) return 0;
    const minPnl = Math.min(...data.map((point) => point.pnl));
    return round2(Math.abs(Math.min(0, minPnl)));
}

function pickStrike(strikes: number[], index: number): number {
    if (strikes.length === 0) return 0;
    const safe = Math.max(0, Math.min(strikes.length - 1, index));
    return strikes[safe];
}

function getDefaultStrikeForm(strategy: StrategyType, strikes: number[]): StrikeForm {
    if (strikes.length === 0) return { ...EMPTY_STRIKES };
    const mid = Math.floor(strikes.length / 2);

    const form = { ...EMPTY_STRIKES };
    form.centerStrike = String(pickStrike(strikes, mid));
    form.putStrike = String(pickStrike(strikes, mid - 1));
    form.callStrike = String(pickStrike(strikes, mid + 1));
    form.putLongStrike = String(pickStrike(strikes, mid - 2));
    form.putShortStrike = String(pickStrike(strikes, mid - 1));
    form.callShortStrike = String(pickStrike(strikes, mid + 1));
    form.callLongStrike = String(pickStrike(strikes, mid + 2));
    form.longCallStrike = String(pickStrike(strikes, mid));
    form.shortCallStrike = String(pickStrike(strikes, mid + 1));
    form.longPutStrike = String(pickStrike(strikes, mid));
    form.shortPutStrike = String(pickStrike(strikes, mid - 1));

    if (strategy === "STRADDLE") {
        form.putStrike = form.centerStrike;
        form.callStrike = form.centerStrike;
    }

    return form;
}

export function OptionsStrategyEngine({ underlying, instruments }: Props) {
    const [strategy, setStrategy] = useState<StrategyType>("STRADDLE");
    const [lots, setLots] = useState("1");
    const [expiry, setExpiry] = useState("");
    const [strikes, setStrikes] = useState<StrikeForm>({ ...EMPTY_STRIKES });
    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);

    const fetchOrders = useTradeExecutionStore((state) => state.fetchOrders);
    const fetchWallet = useWalletStore((state) => state.fetchWallet);
    const equity = useWalletStore((state) => state.equity);
    const blockedBalance = useWalletStore((state) => state.blockedBalance);
    const accountState = useWalletStore((state) => state.accountState);
    const quotesByInstrument = useMarketStore((state) => state.quotesByInstrument);
    const selectPrice = useMarketStore((state) => state.selectPrice);

    const expiryList = useMemo(() => {
        const keys = new Set<string>();
        for (const instrument of instruments) {
            const key = toDateKey(instrument.expiryDate);
            if (key) keys.add(key);
        }
        return Array.from(keys).sort();
    }, [instruments]);

    const strikesForExpiry = useMemo(() => {
        const values = new Set<number>();
        for (const instrument of instruments) {
            if (toDateKey(instrument.expiryDate) !== expiry) continue;
            const strike = Number(instrument.strikePrice);
            if (Number.isFinite(strike) && strike > 0) {
                values.add(strike);
            }
        }
        return Array.from(values).sort((a, b) => a - b);
    }, [expiry, instruments]);

    useEffect(() => {
        if (expiryList.length === 0) {
            setExpiry("");
            return;
        }
        if (!expiry || !expiryList.includes(expiry)) {
            setExpiry(expiryList[0]);
        }
    }, [expiry, expiryList]);

    useEffect(() => {
        if (strikesForExpiry.length === 0) {
            setStrikes({ ...EMPTY_STRIKES });
            setPreview(null);
            return;
        }
        setStrikes(getDefaultStrikeForm(strategy, strikesForExpiry));
        setPreview(null);
    }, [expiry, strategy, strikesForExpiry]);

    const lotsValue = Math.max(1, Number(lots) || 1);
    const isUnsupportedUnderlying = !underlying || underlying === "STOCK OPTIONS";

    const buildPayload = (): StrategyPayload | null => {
        if (!expiry || strikesForExpiry.length === 0) return null;
        const base = {
            strategy,
            underlying,
            expiry,
            lots: lotsValue,
        } as const;

        switch (strategy) {
            case "STRADDLE": {
                const centerStrike = Number(strikes.centerStrike);
                if (!Number.isFinite(centerStrike) || centerStrike <= 0) return null;
                return { ...base, strategy, strikes: { centerStrike } };
            }
            case "STRANGLE": {
                const putStrike = Number(strikes.putStrike);
                const callStrike = Number(strikes.callStrike);
                if (!Number.isFinite(putStrike) || !Number.isFinite(callStrike)) return null;
                return { ...base, strategy, strikes: { putStrike, callStrike } };
            }
            case "IRON_CONDOR": {
                const putLongStrike = Number(strikes.putLongStrike);
                const putShortStrike = Number(strikes.putShortStrike);
                const callShortStrike = Number(strikes.callShortStrike);
                const callLongStrike = Number(strikes.callLongStrike);
                if (
                    !Number.isFinite(putLongStrike) ||
                    !Number.isFinite(putShortStrike) ||
                    !Number.isFinite(callShortStrike) ||
                    !Number.isFinite(callLongStrike)
                ) {
                    return null;
                }
                return {
                    ...base,
                    strategy,
                    strikes: {
                        putLongStrike,
                        putShortStrike,
                        callShortStrike,
                        callLongStrike,
                    },
                };
            }
            case "BULL_CALL_SPREAD": {
                const longCallStrike = Number(strikes.longCallStrike);
                const shortCallStrike = Number(strikes.shortCallStrike);
                if (!Number.isFinite(longCallStrike) || !Number.isFinite(shortCallStrike)) return null;
                return { ...base, strategy, strikes: { longCallStrike, shortCallStrike } };
            }
            case "BEAR_PUT_SPREAD": {
                const longPutStrike = Number(strikes.longPutStrike);
                const shortPutStrike = Number(strikes.shortPutStrike);
                if (!Number.isFinite(longPutStrike) || !Number.isFinite(shortPutStrike)) return null;
                return { ...base, strategy, strikes: { longPutStrike, shortPutStrike } };
            }
            default:
                return null;
        }
    };

    const canPreview = !isUnsupportedUnderlying && Boolean(buildPayload());

    const chartLegs = useMemo<MultiLegPayoffLeg[]>(() => {
        const payload = buildPayload();
        if (!payload) return [];

        const expiryKey = payload.expiry;
        const resolveInstrument = (optionType: "CE" | "PE", strike: number) =>
            instruments.find(
                (item) =>
                    toDateKey(item.expiryDate) === expiryKey &&
                    String(item.optionType || "").toUpperCase() === optionType &&
                    Number(item.strikePrice) === strike &&
                    Boolean(item.instrumentToken)
            );

        const lotMultiplier = payload.lots;
        const createLeg = (
            id: string,
            side: "BUY" | "SELL",
            optionType: "CE" | "PE",
            strike: number
        ): MultiLegPayoffLeg | null => {
            const instrument = resolveInstrument(optionType, strike);
            if (!instrument?.instrumentToken) return null;
            const lotSize = Number(instrument.lotSize) || 1;
            const quantity = lotSize * lotMultiplier;
            const live = quotesByInstrument[instrument.instrumentToken];
            const premium = Number.isFinite(Number(live?.price))
                ? Number(live?.price)
                : Number(instrument.price || 0);
            return {
                id,
                side,
                optionType,
                strike,
                quantity,
                premium: Number.isFinite(premium) && premium > 0 ? premium : 0,
            };
        };

        switch (payload.strategy) {
            case "STRADDLE":
                return [
                    createLeg("LONG_CALL", "BUY", "CE", payload.strikes.centerStrike),
                    createLeg("LONG_PUT", "BUY", "PE", payload.strikes.centerStrike),
                ].filter((item): item is MultiLegPayoffLeg => Boolean(item));
            case "STRANGLE":
                return [
                    createLeg("LONG_PUT", "BUY", "PE", payload.strikes.putStrike),
                    createLeg("LONG_CALL", "BUY", "CE", payload.strikes.callStrike),
                ].filter((item): item is MultiLegPayoffLeg => Boolean(item));
            case "IRON_CONDOR":
                return [
                    createLeg("LONG_PUT_WING", "BUY", "PE", payload.strikes.putLongStrike),
                    createLeg("SHORT_PUT_BODY", "SELL", "PE", payload.strikes.putShortStrike),
                    createLeg("SHORT_CALL_BODY", "SELL", "CE", payload.strikes.callShortStrike),
                    createLeg("LONG_CALL_WING", "BUY", "CE", payload.strikes.callLongStrike),
                ].filter((item): item is MultiLegPayoffLeg => Boolean(item));
            case "BULL_CALL_SPREAD":
                return [
                    createLeg("LONG_CALL", "BUY", "CE", payload.strikes.longCallStrike),
                    createLeg("SHORT_CALL", "SELL", "CE", payload.strikes.shortCallStrike),
                ].filter((item): item is MultiLegPayoffLeg => Boolean(item));
            case "BEAR_PUT_SPREAD":
                return [
                    createLeg("LONG_PUT", "BUY", "PE", payload.strikes.longPutStrike),
                    createLeg("SHORT_PUT", "SELL", "PE", payload.strikes.shortPutStrike),
                ].filter((item): item is MultiLegPayoffLeg => Boolean(item));
            default:
                return [];
        }
    }, [buildPayload, instruments, quotesByInstrument]);

    const spotPrice = useMemo(() => {
        const value = selectPrice(underlying);
        return Number.isFinite(value) && value > 0 ? value : 0;
    }, [selectPrice, underlying, quotesByInstrument]);

    const payoffData = useMemo(
        () => generateMultiLegPayoffSeries(chartLegs, 160),
        [chartLegs]
    );

    const payoffBreakevens = useMemo(
        () => findBreakevenPrices(payoffData),
        [payoffData]
    );

    const projectedAdditionalMargin = useMemo(() => {
        if (preview?.summary?.requiredMargin && Number.isFinite(preview.summary.requiredMargin)) {
            return Math.max(0, preview.summary.requiredMargin);
        }
        return estimateCapitalFromPayoff(payoffData);
    }, [payoffData, preview]);

    const onPreview = async () => {
        const payload = buildPayload();
        if (!payload) return;

        setIsPreviewing(true);
        try {
            const res = await fetch("/api/v1/options/strategies/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok || !data?.success) {
                throw new Error(data?.error?.message || "Failed to generate strategy preview");
            }
            setPreview(data.data as PreviewResponse);
        } catch (error) {
            setPreview(null);
            toast.error("Strategy preview failed", {
                description: error instanceof Error ? error.message : "Unable to preview strategy",
            });
        } finally {
            setIsPreviewing(false);
        }
    };

    const onExecute = async () => {
        const payload = buildPayload();
        if (!payload || !preview) return;

        setIsExecuting(true);
        try {
            const clientOrderKey = `STRAT-${strategy}-${Date.now()}`;
            const res = await fetch("/api/v1/options/strategies/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...payload,
                    clientOrderKey,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data?.success) {
                throw new Error(data?.error?.message || "Failed to execute strategy");
            }

            await Promise.all([fetchOrders(), fetchWallet()]);
            toast.success("Strategy order submitted", {
                description: `${preview.legs.length} legs routed for ${STRATEGY_LABELS[strategy]}.`,
            });
        } catch (error) {
            toast.error("Strategy execution failed", {
                description: error instanceof Error ? error.message : "Unable to execute strategy",
            });
        } finally {
            setIsExecuting(false);
        }
    };

    const renderStrikeSelector = (label: string, key: keyof StrikeForm) => (
        <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
            </Label>
            <Select
                value={strikes[key]}
                onValueChange={(value) => {
                    setStrikes((prev) => ({ ...prev, [key]: value }));
                    setPreview(null);
                }}
            >
                <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select strike" />
                </SelectTrigger>
                <SelectContent>
                    {strikesForExpiry.map((strikeValue) => (
                        <SelectItem key={strikeValue} value={String(strikeValue)}>
                            {strikeValue}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );

    return (
        <Card className="border-border">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm">Options Strategy Engine</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {isUnsupportedUnderlying ? (
                    <div className="text-xs text-muted-foreground">
                        Strategy engine is available for a single underlying at a time.
                    </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Strategy
                        </Label>
                        <Select
                            value={strategy}
                            onValueChange={(value) => setStrategy(value as StrategyType)}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(STRATEGY_LABELS) as StrategyType[]).map((item) => (
                                    <SelectItem key={item} value={item}>
                                        {STRATEGY_LABELS[item]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Expiry
                        </Label>
                        <Select value={expiry} onValueChange={(value) => setExpiry(value)}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select expiry" />
                            </SelectTrigger>
                            <SelectContent>
                                {expiryList.map((item) => (
                                    <SelectItem key={item} value={item}>
                                        {item}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Lots
                        </Label>
                        <Input
                            type="number"
                            min={1}
                            value={lots}
                            className="h-8 text-xs"
                            onChange={(event) => {
                                setLots(event.target.value);
                                setPreview(null);
                            }}
                        />
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                    {strategy === "STRADDLE" && renderStrikeSelector("Center Strike", "centerStrike")}
                    {strategy === "STRANGLE" && (
                        <>
                            {renderStrikeSelector("Put Strike", "putStrike")}
                            {renderStrikeSelector("Call Strike", "callStrike")}
                        </>
                    )}
                    {strategy === "IRON_CONDOR" && (
                        <>
                            {renderStrikeSelector("Put Wing (Long)", "putLongStrike")}
                            {renderStrikeSelector("Put Body (Short)", "putShortStrike")}
                            {renderStrikeSelector("Call Body (Short)", "callShortStrike")}
                            {renderStrikeSelector("Call Wing (Long)", "callLongStrike")}
                        </>
                    )}
                    {strategy === "BULL_CALL_SPREAD" && (
                        <>
                            {renderStrikeSelector("Long Call Strike", "longCallStrike")}
                            {renderStrikeSelector("Short Call Strike", "shortCallStrike")}
                        </>
                    )}
                    {strategy === "BEAR_PUT_SPREAD" && (
                        <>
                            {renderStrikeSelector("Long Put Strike", "longPutStrike")}
                            {renderStrikeSelector("Short Put Strike", "shortPutStrike")}
                        </>
                    )}
                </div>

                <div className="flex gap-2">
                    <Button
                        className="h-8"
                        onClick={onPreview}
                        disabled={!canPreview || isPreviewing}
                    >
                        {isPreviewing ? "Calculating..." : "Preview Strategy"}
                    </Button>
                    <Button
                        className="h-8"
                        variant="secondary"
                        onClick={onExecute}
                        disabled={!preview || isExecuting}
                    >
                        {isExecuting ? "Executing..." : "Execute Multi-Leg"}
                    </Button>
                </div>

                <PostTradeRiskPreview
                    projectedAdditionalMargin={projectedAdditionalMargin}
                    equity={equity}
                    blockedMargin={blockedBalance}
                    accountState={accountState}
                />

                {preview ? (
                    <div className="space-y-3 rounded border border-border p-3">
                        <div className="grid gap-2 md:grid-cols-5">
                            <Badge variant="outline" className="justify-center">
                                {preview.summary.premiumType} {formatMoney(Math.abs(preview.summary.totalPremium))}
                            </Badge>
                            <Badge variant="outline" className="justify-center">
                                Margin {formatMoney(preview.summary.requiredMargin)}
                            </Badge>
                            <Badge variant="outline" className="justify-center">
                                Max Profit{" "}
                                {preview.summary.maxProfit === null
                                    ? "Unlimited"
                                    : formatMoney(preview.summary.maxProfit)}
                            </Badge>
                            <Badge variant="outline" className="justify-center">
                                Max Loss{" "}
                                {preview.summary.maxLoss === null
                                    ? "Unlimited"
                                    : formatMoney(preview.summary.maxLoss)}
                            </Badge>
                            <Badge variant="outline" className="justify-center">
                                BE {preview.summary.breakevens.length > 0 ? preview.summary.breakevens.join(", ") : "N/A"}
                            </Badge>
                        </div>

                        <div className="space-y-1">
                            {preview.legs.map((leg) => (
                                <div
                                    key={`${leg.instrumentToken}-${leg.role}`}
                                    className="flex items-center justify-between text-xs border-b border-border/50 pb-1"
                                >
                                    <span className="font-medium">
                                        {leg.side} {leg.symbol} ({leg.quantity})
                                    </span>
                                    <span>
                                        LTP {formatMoney(leg.ltp)} | Premium {formatMoney(leg.premium)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-12">
                    <div className="lg:col-span-8">
                        <MultiLegPayoffChart
                            legs={chartLegs}
                            data={payoffData}
                            breakevens={payoffBreakevens}
                            spotPrice={spotPrice}
                            title="Frontend Multi-Leg Payoff"
                            pointCount={160}
                            height={280}
                        />
                    </div>
                    <div className="lg:col-span-4">
                        <StrategyRiskCard payoffData={payoffData} />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
