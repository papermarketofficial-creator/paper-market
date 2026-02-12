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

function toFallbackQuoteMap(prices: Record<string, number>): UpstoxQuoteMap {
    const map: UpstoxQuoteMap = {};
    for (const [key, price] of Object.entries(prices)) {
        const safePrice = Number(price) || 0;
        map[key] = {
            last_price: safePrice,
            close_price: safePrice,
        };
    }
    return map;
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
        const upstreamData: UpstoxQuoteMap = upstream?.data || {};

        // Primary path: full quote payload (includes close_price).
        if (response.ok && upstreamStatus !== "error" && Object.keys(upstreamData).length > 0) {
            return NextResponse.json({
                success: true,
                data: upstreamData,
                count: Object.keys(upstreamData).length,
                source: "quotes",
                timestamp: new Date().toISOString(),
            });
        }

        // Fallback path: LTP endpoint is usually more resilient for some instruments.
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
        const fallbackData = toFallbackQuoteMap(prices);

        if (Object.keys(fallbackData).length > 0) {
            return NextResponse.json({
                success: true,
                data: fallbackData,
                count: Object.keys(fallbackData).length,
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
