export type PayoffOptionType = "CE" | "PE";
export type PayoffSide = "BUY" | "SELL";

export type MultiLegPayoffLeg = {
    id: string;
    side: PayoffSide;
    optionType: PayoffOptionType;
    strike: number;
    quantity: number;
    premium: number;
};

export type MultiLegPayoffPoint = {
    price: number;
    pnl: number;
};

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function normalizePoints(points: number): number {
    const parsed = Number.isFinite(points) ? Math.floor(points) : 160;
    if (parsed < 120) return 120;
    if (parsed > 180) return 180;
    return parsed;
}

export function calculateLegIntrinsic(
    optionType: PayoffOptionType,
    strike: number,
    spotPrice: number
): number {
    if (optionType === "CE") return Math.max(spotPrice - strike, 0);
    return Math.max(strike - spotPrice, 0);
}

export function calculateLegPnL(leg: MultiLegPayoffLeg, spotPrice: number): number {
    const intrinsic = calculateLegIntrinsic(leg.optionType, leg.strike, spotPrice);
    const unitPnl = leg.side === "BUY" ? intrinsic - leg.premium : leg.premium - intrinsic;
    return unitPnl * leg.quantity;
}

export function calculateNetPnL(legs: MultiLegPayoffLeg[], spotPrice: number): number {
    return round2(legs.reduce((sum, leg) => sum + calculateLegPnL(leg, spotPrice), 0));
}

export function buildPayoffRange(legs: MultiLegPayoffLeg[]): { min: number; max: number } {
    const validStrikes = legs
        .map((leg) => Number(leg.strike))
        .filter((strike) => Number.isFinite(strike) && strike > 0);

    if (validStrikes.length === 0) {
        return { min: 1, max: 2 };
    }

    const low = Math.min(...validStrikes);
    const high = Math.max(...validStrikes);
    return {
        min: Math.max(1, Math.floor(low * 0.5)),
        max: Math.ceil(high * 1.5),
    };
}

export function generateMultiLegPayoffSeries(
    legs: MultiLegPayoffLeg[],
    points = 160
): MultiLegPayoffPoint[] {
    if (legs.length === 0) return [];

    const { min, max } = buildPayoffRange(legs);
    const pointCount = normalizePoints(points);
    const step = (max - min) / Math.max(1, pointCount - 1);

    const out: MultiLegPayoffPoint[] = [];
    for (let i = 0; i < pointCount; i++) {
        const price = i === pointCount - 1 ? max : min + i * step;
        out.push({
            price: round2(price),
            pnl: calculateNetPnL(legs, price),
        });
    }

    return out;
}

export function findBreakevenPrices(series: MultiLegPayoffPoint[]): number[] {
    if (series.length < 2) return [];

    const out: number[] = [];
    for (let i = 1; i < series.length; i++) {
        const a = series[i - 1];
        const b = series[i];

        if (a.pnl === 0) {
            out.push(round2(a.price));
            continue;
        }

        if (a.pnl * b.pnl > 0) continue;

        const denominator = b.pnl - a.pnl;
        if (denominator === 0) continue;
        const x = a.price + ((0 - a.pnl) * (b.price - a.price)) / denominator;
        if (Number.isFinite(x)) out.push(round2(x));
    }

    return Array.from(new Set(out.map((value) => value.toFixed(2)))).map((value) =>
        Number(value)
    );
}
