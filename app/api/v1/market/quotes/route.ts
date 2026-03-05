import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { instruments } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { toInstrumentKey } from "@/lib/market/symbol-normalization";
import { resolveUpstoxPreviousClose } from "@/lib/market/upstox-quote-normalization";

const UPSTOX_API_URL = "https://api.upstox.com/v2";

type UpstoxQuoteMap = Record<string, any>;

function sanitizeInstrumentKeys(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    const keys = input
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

    return Array.from(new Set(keys));
}

function toUpstoxRequestInstrumentKey(raw: string): string {
    const normalized = String(raw || "")
        .trim()
        .replace(":", "|")
        .replace(/\s*\|\s*/g, "|")
        .replace(/\s+/g, " ");

    if (!normalized) return "";

    const [prefixRaw, suffixRaw = ""] = normalized.split("|");
    const prefix = String(prefixRaw || "").toUpperCase();
    const suffix = String(suffixRaw || "").trim();
    if (!suffix) return prefix;

    if (prefix.endsWith("_INDEX")) {
        const titled = suffix
            .toLowerCase()
            .split(" ")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
        return `${prefix}|${titled}`;
    }

    return `${prefix}|${suffix.toUpperCase()}`;
}

function parseJsonSafe(text: string): any | null {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function normalizeErrorMessage(error: unknown): string {
    if (error instanceof Error && typeof error.message === "string") {
        const msg = error.message.trim();
        if (msg.length > 0) return msg;
    }
    return "Failed to fetch quotes";
}

function buildQuoteLookup(quotes: UpstoxQuoteMap): Map<string, { last: number; close: number }> {
    const out = new Map<string, { last: number; close: number }>();

    for (const [key, quote] of Object.entries(quotes || {})) {
        const normalizedKey = toInstrumentKey(key);
        if (!normalizedKey) continue;

        const last = Number(quote?.last_price);
        if (!Number.isFinite(last) || last <= 0) continue;

        const resolvedClose = resolveUpstoxPreviousClose(quote, last);
        const close = resolvedClose ?? last;

        out.set(normalizedKey, { last, close });
        out.set(normalizedKey.replace("|", ":"), { last, close });
        out.set(normalizedKey.replace(":", "|"), { last, close });

        const sep = normalizedKey.includes(":") ? ":" : normalizedKey.includes("|") ? "|" : "";
        const suffix = sep ? normalizedKey.split(sep)[1] || "" : normalizedKey;
        if (suffix) {
            out.set(`suffix:${suffix.toUpperCase()}`, { last, close });
        }
    }

    return out;
}

async function buildSymbolSuffixLookup(instrumentKeys: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const equityIsinKeys = Array.from(
        new Set(
            instrumentKeys
                .map((key) => toInstrumentKey(key))
                .filter((key) => /^(NSE_EQ|BSE_EQ)[|:][A-Z0-9]{8,20}$/.test(key))
                .map((key) => key.replace(":", "|"))
        )
    );

    if (equityIsinKeys.length === 0) return out;

    try {
        const rows = await db
            .select({
                instrumentToken: instruments.instrumentToken,
                symbol: instruments.tradingsymbol,
            })
            .from(instruments)
            .where(inArray(instruments.instrumentToken, equityIsinKeys));

        for (const row of rows) {
            const key = toInstrumentKey(row.instrumentToken);
            const symbol = String(row.symbol || "").trim().toUpperCase();
            if (!key || !symbol) continue;
            out.set(key, symbol);
        }
    } catch (error) {
        logger.warn({ err: error }, "Failed to load quote key symbol aliases");
    }

    return out;
}

function toRequestedKeyPayload(
    instrumentKeys: string[],
    lookup: Map<string, { last: number; close: number }>,
    symbolSuffixByKey?: Map<string, string>
): UpstoxQuoteMap {
    const out: UpstoxQuoteMap = {};

    for (const rawKey of instrumentKeys) {
        const key = toInstrumentKey(rawKey);
        if (!key) continue;

        const sep = key.includes(":") ? ":" : key.includes("|") ? "|" : "";
        const suffix = sep ? key.split(sep)[1] || "" : key;
        const mappedSymbolSuffix = symbolSuffixByKey?.get(key);

        const candidates = [
            key,
            key.replace("|", ":"),
            key.replace(":", "|"),
            suffix ? `suffix:${suffix.toUpperCase()}` : "",
            mappedSymbolSuffix ? `suffix:${mappedSymbolSuffix}` : "",
        ].filter(Boolean);

        let quote: { last: number; close: number } | undefined;
        for (const candidate of candidates) {
            quote = lookup.get(candidate);
            if (quote) break;
        }

        if (!quote) continue;

        out[key] = {
            last_price: quote.last,
            close_price: quote.close,
        };
    }

    return out;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const requestKeys = sanitizeInstrumentKeys(body?.instrumentKeys);
        const instrumentKeys = Array.from(
            new Set(
                requestKeys
                    .map((key) => toInstrumentKey(key))
                    .filter((key) => key.length > 0)
            )
        );

        if (requestKeys.length === 0 || instrumentKeys.length === 0) {
            return NextResponse.json(
                { success: false, error: "instrumentKeys array is required" },
                { status: 400 }
            );
        }

        const symbolSuffixByKey = await buildSymbolSuffixLookup(instrumentKeys);
        const upstreamInstrumentKeys = Array.from(
            new Set(
                requestKeys
                    .map((key) => toUpstoxRequestInstrumentKey(key))
                    .filter((key) => key.length > 0)
            )
        );

        const { UpstoxService } = await import("@/services/upstox.service");
        const token = await UpstoxService.getSystemToken();

        if (!token) {
            throw new ApiError("No system token available", 503, "UPSTOX_TOKEN_MISSING");
        }

        const params = new URLSearchParams();
        params.set("instrument_key", upstreamInstrumentKeys.join(","));
        const url = `${UPSTOX_API_URL}/market-quote/quotes?${params.toString()}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
            },
        });

        const rawText = await response.text();
        const upstream = parseJsonSafe(rawText);
        const upstreamStatus = upstream?.status;
        const upstreamData = (upstream?.data || {}) as UpstoxQuoteMap;

        if (response.ok && upstreamStatus !== "error" && Object.keys(upstreamData).length > 0) {
            const lookup = buildQuoteLookup(upstreamData);
            const payload = toRequestedKeyPayload(instrumentKeys, lookup, symbolSuffixByKey);
            if (Object.keys(payload).length > 0) {
                return NextResponse.json({
                    success: true,
                    data: payload,
                    count: Object.keys(payload).length,
                    source: "quotes",
                    timestamp: new Date().toISOString(),
                });
            }
        }

        logger.warn(
            {
                status: response.status,
                statusText: response.statusText,
                upstreamStatus,
                upstreamMessage: upstream?.message,
            },
            "Quotes endpoint failed, using LTP fallback"
        );

        const prices = await UpstoxService.getSystemQuotes(upstreamInstrumentKeys);
        const ltpAsQuotes: UpstoxQuoteMap = {};
        for (const [key, price] of Object.entries(prices)) {
            const last = Number(price);
            if (!Number.isFinite(last) || last <= 0) continue;
            ltpAsQuotes[key] = {
                last_price: last,
                close_price: last,
            };
        }

        const ltpLookup = buildQuoteLookup(ltpAsQuotes);
        const fallbackPayload = toRequestedKeyPayload(instrumentKeys, ltpLookup, symbolSuffixByKey);

        if (Object.keys(fallbackPayload).length > 0) {
            logger.info({ count: Object.keys(fallbackPayload).length }, "Quotes served from LTP fallback");
            return NextResponse.json({
                success: true,
                data: fallbackPayload,
                count: Object.keys(fallbackPayload).length,
                source: "ltp-fallback",
                timestamp: new Date().toISOString(),
            });
        }

        // Both primary and fallback failed
        const msg =
            (typeof upstream?.message === "string" && upstream.message.trim()) ||
            `${response.status} ${response.statusText}`.trim() ||
            "Failed to fetch quotes";

        throw new ApiError(msg, 502, "UPSTOX_QUOTES_FAILED");
    } catch (error) {
        logger.error({ err: error }, "Quote fetch error");
        if (error instanceof ApiError) {
            return handleError(error);
        }

        return handleError(
            new ApiError(
                normalizeErrorMessage(error),
                502,
                "UPSTOX_QUOTES_INTERNAL"
            )
        );
    }
}
