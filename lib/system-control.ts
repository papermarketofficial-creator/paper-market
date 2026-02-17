import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

type TradingGateOptions = {
    force?: boolean;
    context?: string;
};

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
let runtimeHaltReason: string | null = null;

let lastKnownTradingEnabled = computeTradingEnabled();

function parseTradingDisabledFlag(): boolean {
    const raw = String(process.env.TRADING_DISABLED ?? "false").trim().toLowerCase();
    return TRUE_VALUES.has(raw);
}

function computeTradingEnabled(): boolean {
    return !parseTradingDisabledFlag() && !runtimeHaltReason;
}

function emitTransitionIfNeeded(nextEnabled: boolean): void {
    if (nextEnabled === lastKnownTradingEnabled) return;

    lastKnownTradingEnabled = nextEnabled;
    if (nextEnabled) {
        logger.warn(
            { event: "SYSTEM_TRADING_RESUMED" },
            "SYSTEM_TRADING_RESUMED"
        );
    } else {
        logger.error(
            { event: "SYSTEM_TRADING_HALTED" },
            "SYSTEM_TRADING_HALTED"
        );
    }
}

export function isTradingEnabled(): boolean {
    const next = computeTradingEnabled();
    emitTransitionIfNeeded(next);
    return next;
}

export function haltTrading(reason: string): void {
    const normalized = String(reason || "UNKNOWN").trim().toUpperCase();
    if (!normalized) return;

    runtimeHaltReason = normalized;
    emitTransitionIfNeeded(computeTradingEnabled());
}

export function resumeTrading(reason: string): void {
    const normalized = String(reason || "UNKNOWN").trim().toUpperCase();
    if (!normalized) return;

    runtimeHaltReason = null;
    emitTransitionIfNeeded(computeTradingEnabled());
}

export function assertTradingEnabled(options: TradingGateOptions = {}): void {
    if (options.force) return;
    if (isTradingEnabled()) return;

    throw new ApiError(
        "Trading is temporarily disabled",
        503,
        "TRADING_DISABLED"
    );
}
