import { prewarmCore } from "@/lib/startup/prewarm";

export async function preloadCore() {
    await prewarmCore();
}

function shouldRunCorePreload(): boolean {
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
    const isVercel = process.env.VERCEL === "1";
    const disabledByFlag = String(process.env.DISABLE_CORE_PREWARM ?? "").toLowerCase() === "true";
    return !isBuildPhase && !isVercel && !disabledByFlag;
}

if (shouldRunCorePreload()) {
    preloadCore().catch((err) => {
        console.error("[FATAL] Core preload failed:", err);
    });
}

