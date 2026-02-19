import { logger } from "@/lib/logger";
import { instrumentStore } from "@/stores/instrument.store";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { marketFeedSupervisor } from "@/lib/trading/market-feed-supervisor";
import { mtmEngineService } from "@/services/mtm-engine.service";

const DEFAULT_PREWARM_INSTRUMENT_KEYS = [
    "NSE_INDEX|Nifty 50",
    "NSE_INDEX|Nifty Bank",
    "NSE_INDEX|Nifty Fin Service",
];

function resolvePrewarmSymbols(): string[] {
    const raw = String(process.env.PREWARM_INSTRUMENT_KEYS ?? "").trim();
    if (!raw) return DEFAULT_PREWARM_INSTRUMENT_KEYS;
    return raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

export async function prewarmCore(): Promise<void> {
    await instrumentStore.initialize();

    await realTimeMarketService.initialize();
    await marketFeedSupervisor.initialize();
    await mtmEngineService.initialize();

    const symbols = resolvePrewarmSymbols();
    if (symbols.length > 0) {
        await realTimeMarketService.subscribe(symbols);
        await realTimeMarketService.warmSnapshotForSymbols(symbols);
    }

    logger.info({ prewarmedSymbols: symbols.length }, "Core prewarm completed");
}
