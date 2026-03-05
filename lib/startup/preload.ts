import { prewarmCore } from "@/lib/startup/prewarm";

export async function preloadCore() {
    await prewarmCore();
}

function hasExternalMarketEngine(): boolean {
    const wsUrl = String(process.env.NEXT_PUBLIC_MARKET_ENGINE_WS_URL ?? "").trim();
    const engineUrl = String(process.env.MARKET_ENGINE_URL ?? "").trim();
    return wsUrl.length > 0 || engineUrl.length > 0;
}

function shouldRunCorePreload(): boolean {
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
    const isVercel = process.env.VERCEL === "1";
    const disabledByFlag = String(process.env.DISABLE_CORE_PREWARM ?? "").toLowerCase() === "true";
    const forcedByFlag = String(process.env.FORCE_CORE_PREWARM ?? "").toLowerCase() === "true";
    const disabledForExternalEngine = hasExternalMarketEngine() && !forcedByFlag;
    return !isBuildPhase && !isVercel && !disabledByFlag && !disabledForExternalEngine;
}

if (shouldRunCorePreload()) {
    preloadCore().catch((err) => {
        console.error("[FATAL] Core preload failed:", err);
    });
}

