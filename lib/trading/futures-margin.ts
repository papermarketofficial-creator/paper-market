type FutureInstrumentLike = {
    underlying?: unknown;
    name?: unknown;
    tradingsymbol?: unknown;
    symbol?: unknown;
};

export const INDEX_FUTURES_MARGIN_PERCENT = 0.12;
export const STOCK_FUTURES_MARGIN_PERCENT = 0.18;

const INDEX_KEYS = [
    "NIFTY",
    "NIFTY50",
    "BANKNIFTY",
    "NIFTYBANK",
    "FINNIFTY",
    "NIFTYFINSERVICE",
    "MIDCPNIFTY",
    "MIDCAPNIFTY",
    "MIDCAP",
    "SENSEX",
    "BANKEX",
];

function normalize(value: unknown): string {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

function isIndexKey(value: string): boolean {
    if (!value) return false;
    return INDEX_KEYS.some((key) => value === key || value.includes(key));
}

export function isIndexFutureInstrument(instrument?: FutureInstrumentLike | null): boolean {
    if (!instrument) return false;

    const candidates = [
        normalize(instrument.underlying),
        normalize(instrument.name),
        normalize(instrument.tradingsymbol),
        normalize(instrument.symbol),
    ];

    return candidates.some(isIndexKey);
}

export function resolveFuturesMarginPercent(instrument?: FutureInstrumentLike | null): number {
    return isIndexFutureInstrument(instrument)
        ? INDEX_FUTURES_MARGIN_PERCENT
        : STOCK_FUTURES_MARGIN_PERCENT;
}

export function resolveEffectiveLeverage(leverage: unknown): number {
    const parsed = Number(leverage);
    if (!Number.isFinite(parsed) || parsed <= 0) return 1;
    return Math.max(1, parsed);
}

export function calculateFuturesRequiredMargin(params: {
    price: number;
    quantity: number;
    leverage?: number;
    instrument?: FutureInstrumentLike | null;
}): number {
    const qty = Math.abs(Number(params.quantity) || 0);
    const price = Number(params.price) || 0;
    if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price <= 0) return 0;

    const contractValue = qty * price;
    const marginPercent = resolveFuturesMarginPercent(params.instrument);
    const baseMargin = contractValue * marginPercent;
    const leverage = resolveEffectiveLeverage(params.leverage);
    return baseMargin / leverage;
}
