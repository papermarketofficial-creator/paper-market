import { db } from "@/lib/db";
import { instruments, InstrumentType } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { marketSimulation } from "@/services/market-simulation.service";
import { OptionChainInput } from "@/lib/validation/option-chain";
import { UpstoxService } from "@/services/upstox.service";

const UNDERLYING_ALIAS: Record<string, string> = {
    NIFTY50: "NIFTY",
    "NIFTY 50": "NIFTY",
    NIFTYBANK: "BANKNIFTY",
    "NIFTY BANK": "BANKNIFTY",
    NIFTYFINSERVICE: "FINNIFTY",
    "NIFTY FIN SERVICE": "FINNIFTY",
    MIDCPNIFTY: "MIDCAP",
    MIDCAP: "MIDCAP",
};

function normalizeUnderlyingSymbol(raw: string): string {
    const value = String(raw || "").trim().toUpperCase();
    if (!value) return "";
    const compact = value.replace(/\s+/g, "");
    return UNDERLYING_ALIAS[value] || UNDERLYING_ALIAS[compact] || value;
}

function toDateKey(raw: Date | string | null | undefined): string {
    if (!raw) return "";
    const value = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
}

function roundToTwo(value: number): number {
    return Math.round(value * 100) / 100;
}

function computeSyntheticOptionLtp(
    optionType: "CE" | "PE",
    underlyingPrice: number,
    strike: number
): number {
    if (!Number.isFinite(underlyingPrice) || underlyingPrice <= 0) return 0;

    const intrinsic =
        optionType === "CE"
            ? Math.max(0, underlyingPrice - strike)
            : Math.max(0, strike - underlyingPrice);

    const timeValue = Math.max(10, underlyingPrice * 0.002);
    return roundToTwo(intrinsic + timeValue);
}

function computeSyntheticOptionStats(
    underlyingPrice: number,
    strike: number,
    lotSize: number,
    daysToExpiry: number
): { oi: number; volume: number; iv: number } {
    if (!Number.isFinite(underlyingPrice) || underlyingPrice <= 0) {
        return { oi: 0, volume: 0, iv: 0 };
    }

    const safeLot = Number.isFinite(lotSize) && lotSize > 0 ? Math.max(1, Math.round(lotSize)) : 1;
    const distanceRatio = Math.abs(strike - underlyingPrice) / underlyingPrice;
    const proximity = Math.max(0, 1 - distanceRatio * 8);

    // Paper-mode deterministic liquidity profile: highest near ATM.
    const oiLots = Math.round(100 + proximity * 900);
    const volumeLots = Math.round(10 + proximity * 120);
    const oi = Math.max(safeLot, oiLots * safeLot);
    const volume = Math.max(1, volumeLots * safeLot);

    // Deterministic IV profile (not broker-accurate, but stable for simulation UX).
    const expiryBoost = daysToExpiry > 0 ? Math.min(15, 45 / daysToExpiry) : 15;
    const iv = roundToTwo(Math.max(8, Math.min(120, 18 + distanceRatio * 120 + expiryBoost)));

    return { oi, volume, iv };
}

export class OptionChainService {
    static async getOptionChain(input: OptionChainInput) {
        const normalizedUnderlying = normalizeUnderlyingSymbol(input.symbol);

        // 1. Fetch all options for the underlying
        const options = await db
            .select()
            .from(instruments)
            .where(
                and(
                    eq(instruments.underlying, normalizedUnderlying),
                    eq(instruments.instrumentType, InstrumentType.OPTION),
                    eq(instruments.isActive, true)
                )
            )
            .orderBy(asc(instruments.expiry), asc(instruments.strike));

        if (options.length === 0) {
            return { underlying: normalizedUnderlying, strikes: [] };
        }

        // 2. Determine Expiry
        // If input.expiry is null, pick the nearest one from the results (date-only)
        let targetExpiry = toDateKey(input.expiry);
        if (!targetExpiry) {
            const expiries = Array.from(new Set(options.map(o => toDateKey(o.expiry)).filter(Boolean))).sort();
            if (expiries.length > 0) targetExpiry = expiries[0];
        }

        if (!targetExpiry) return { underlying: normalizedUnderlying, strikes: [] };

        // 3. Filter by Expiry (date-only compare)
        const chainOptions = options.filter((o) => toDateKey(o.expiry) === targetExpiry);

        const optionQuoteDetails = await UpstoxService.getSystemQuoteDetails(
            chainOptions.map((opt) => opt.instrumentToken)
        );

        let underlyingPrice = Number(marketSimulation.getQuote(normalizedUnderlying)?.price || 0);
        let underlyingChangePercent = 0;

        try {
            const underlyingToken = await UpstoxService.resolveInstrumentKey(normalizedUnderlying);
            const underlyingDetails = await UpstoxService.getSystemQuoteDetails([underlyingToken]);
            const detail =
                underlyingDetails[underlyingToken] ||
                underlyingDetails[underlyingToken.replace("|", ":")];

            const ltp = Number(detail?.lastPrice || 0);
            const close = Number(detail?.closePrice || 0);

            if (Number.isFinite(ltp) && ltp > 0) {
                underlyingPrice = ltp;
            }
            if (Number.isFinite(ltp) && ltp > 0 && Number.isFinite(close) && close > 0) {
                underlyingChangePercent = ((ltp - close) / close) * 100;
            }
        } catch {
            // keep best-effort fallback from simulation quote
        }

        const expiryDate = new Date(`${targetExpiry}T15:30:00+05:30`);
        const daysToExpiry = Number.isNaN(expiryDate.getTime())
            ? 0
            : Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

        // 4. Group by Strike
        const strikeMap = new Map<number, { strike: number, ce?: any, pe?: any }>();

        for (const opt of chainOptions) {
            const strike = parseFloat(opt.strike || "0");
            if (strike === 0) continue;

            if (!strikeMap.has(strike)) {
                strikeMap.set(strike, { strike });
            }

            const entry = strikeMap.get(strike)!;

            const optionType = String(opt.optionType || "").toUpperCase();
            const isCE = optionType === "CE";
            const isPE = optionType === "PE";

            // Get real price first
            const quote = marketSimulation.getQuote(opt.tradingsymbol);
            const quotePrice = Number(quote?.price || 0);
            const detail =
                optionQuoteDetails[opt.instrumentToken] ||
                optionQuoteDetails[opt.instrumentToken.replace("|", ":")];
            const ltpFromDetails = Number(detail?.lastPrice || 0);

            const realLtp =
                Number.isFinite(ltpFromDetails) && ltpFromDetails > 0
                    ? ltpFromDetails
                    : Number.isFinite(quotePrice) && quotePrice > 0
                        ? quotePrice
                        : 0;

            let ltp = roundToTwo(realLtp);
            if (!(Number.isFinite(ltp) && ltp > 0)) {
                if (isCE || isPE) {
                    ltp = computeSyntheticOptionLtp(
                        isCE ? "CE" : "PE",
                        underlyingPrice,
                        strike
                    );
                } else if (Number.isFinite(underlyingPrice) && underlyingPrice > 0) {
                    // Defensive fallback for unexpected option type.
                    ltp = roundToTwo(Math.max(10, underlyingPrice * 0.002));
                } else {
                    ltp = 0;
                }
            }

            const rawOi = Number(detail?.oi ?? 0);
            const rawVolume = Number(detail?.volume ?? 0);
            const syntheticStats = computeSyntheticOptionStats(
                underlyingPrice,
                strike,
                Number(opt.lotSize || 1),
                daysToExpiry
            );
            const oi =
                Number.isFinite(rawOi) && rawOi > 0
                    ? Math.max(0, Math.round(rawOi))
                    : syntheticStats.oi;
            const volume =
                Number.isFinite(rawVolume) && rawVolume > 0
                    ? Math.max(0, Math.round(rawVolume))
                    : syntheticStats.volume;
            const iv = syntheticStats.iv;

            const data = {
                symbol: opt.tradingsymbol,
                ltp: ltp,
                oi,
                volume,
                iv,
                lotSize: opt.lotSize
            };

            if (isCE) entry.ce = data;
            if (isPE) entry.pe = data;
        }

        // 5. Convert to Array and Sort
        const strikes = Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);

        return {
            underlying: normalizedUnderlying,
            underlyingPrice,
            underlyingChangePercent,
            expiry: targetExpiry,
            strikes
        };
    }
}
