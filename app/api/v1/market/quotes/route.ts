import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const UPSTOX_API_URL = "https://api.upstox.com/v2";

type UpstoxQuoteMap = Record<string, { last_price?: number; close_price?: number }>;

function sanitizeInstrumentKeys(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    const keys = input
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

    return Array.from(new Set(keys));
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
        const last = Number(quote?.last_price);
        if (!Number.isFinite(last) || last <= 0) continue;

        const closeRaw = Number(quote?.close_price);
        const close = Number.isFinite(closeRaw) && closeRaw > 0 ? closeRaw : last;

        out.set(key, { last, close });
        out.set(key.replace(":", "|"), { last, close });
        out.set(key.replace("|", ":"), { last, close });

        const sep = key.includes(":") ? ":" : key.includes("|") ? "|" : "";
        const suffix = sep ? key.split(sep)[1] || "" : key;
        if (suffix) {
            out.set(`suffix:${suffix.toUpperCase()}`, { last, close });
        }
    }

    return out;
}

function toRequestedKeyPayload(
    instrumentKeys: string[],
    lookup: Map<string, { last: number; close: number }>
): UpstoxQuoteMap {
    const out: UpstoxQuoteMap = {};

    for (const key of instrumentKeys) {
        const sep = key.includes(":") ? ":" : key.includes("|") ? "|" : "";
        const suffix = sep ? key.split(sep)[1] || "" : key;
        const quote =
            lookup.get(key) ||
            lookup.get(key.replace("|", ":")) ||
            lookup.get(key.replace(":", "|")) ||
            (suffix ? lookup.get(`suffix:${suffix.toUpperCase()}`) : undefined);

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
        const instrumentKeys = sanitizeInstrumentKeys(body?.instrumentKeys);

        if (instrumentKeys.length === 0) {
            return NextResponse.json(
                { success: false, error: "instrumentKeys array is required" },
                { status: 400 }
            );
        }

        const { UpstoxService } = await import("@/services/upstox.service");
        const token = await UpstoxService.getSystemToken();

        if (!token) {
            throw new ApiError("No system token available", 503, "UPSTOX_TOKEN_MISSING");
        }

        const params = new URLSearchParams();
        params.set("instrument_key", instrumentKeys.join(","));
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
            const payload = toRequestedKeyPayload(instrumentKeys, lookup);
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

        const prices = await UpstoxService.getSystemQuotes(instrumentKeys);
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
        const fallbackPayload = toRequestedKeyPayload(instrumentKeys, ltpLookup);

        if (Object.keys(fallbackPayload).length > 0) {
            return NextResponse.json({
                success: true,
                data: fallbackPayload,
                count: Object.keys(fallbackPayload).length,
                source: "ltp-fallback",
                timestamp: new Date().toISOString(),
            });
        }

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
