import { logger } from "@/lib/logger";
import { toInstrumentKey } from "@/lib/market/symbol-normalization";
import { realTimeMarketService } from "@/services/realtime-market.service";
import { UpstoxService, type SystemQuoteDetail } from "@/services/upstox.service";
import { marketSimulation } from "@/services/market-simulation.service";
import { instrumentStore } from "@/stores/instrument.store";

const SYNTHETIC_FALLBACK_PRICE = Math.max(
    1,
    Number(process.env.SYNTHETIC_FALLBACK_PRICE ?? "100")
);
const SNAPSHOT_CACHE_TTL_MS = Math.max(
    100,
    Number(process.env.PRICE_ORACLE_SNAPSHOT_CACHE_MS ?? "1500")
);

function toPrice(value: unknown): number | null {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric;
}

function normalizeTokenKey(value: string): string {
    return String(value || "").trim().toUpperCase().replace(":", "|");
}

type PriceOracleHints = {
    symbolHint?: string;
    nameHint?: string;
};

export class PriceOracleService {
    private readonly recentPriceByToken = new Map<string, { price: number; expiresAt: number }>();
    private readonly inflight = new Map<string, Promise<SystemQuoteDetail | null>>();

    private resolveSnapshotDetail(
        requestedToken: string,
        details: Record<string, SystemQuoteDetail>
    ): SystemQuoteDetail | null {
        const requested = normalizeTokenKey(requestedToken);
        if (!requested) return null;
        const entries = Object.entries(details);
        if (entries.length === 1) {
            return entries[0][1];
        }

        for (const [key, detail] of entries) {
            const normalizedKey = normalizeTokenKey(key);
            if (normalizedKey === requested) return detail;
        }

        const requestedParts = requested.split("|");
        const requestedSuffix = requestedParts.length > 1 ? requestedParts.slice(1).join("|") : requestedParts[0];
        for (const [key, detail] of entries) {
            const normalizedKey = normalizeTokenKey(key);
            const keyParts = normalizedKey.split("|");
            const keySuffix = keyParts.length > 1 ? keyParts.slice(1).join("|") : keyParts[0];
            if (keySuffix === requestedSuffix) return detail;
        }

        return null;
    }

    private async getSnapshotDetail(token: string): Promise<SystemQuoteDetail | null> {
        const now = Date.now();
        const cached = this.recentPriceByToken.get(token);
        if (cached && cached.expiresAt > now) {
            return { lastPrice: cached.price, closePrice: null };
        }

        const existing = this.inflight.get(token);
        if (existing) {
            return existing;
        }

        const task = (async () => {
            const details = await UpstoxService.getSystemQuoteDetails([token]);
            const detail = this.resolveSnapshotDetail(token, details);
            const price = toPrice(detail?.lastPrice);
            if (price !== null) {
                this.recentPriceByToken.set(token, {
                    price,
                    expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS,
                });
            }
            return detail;
        })();

        this.inflight.set(token, task);
        try {
            return await task;
        } finally {
            this.inflight.delete(token);
        }
    }

    async getBestPrice(instrumentToken: string, hints: PriceOracleHints = {}): Promise<number> {
        const token = toInstrumentKey(String(instrumentToken || ""));
        if (!token) {
            logger.error(
                { instrumentToken, fallbackPrice: SYNTHETIC_FALLBACK_PRICE },
                "Using synthetic fallback price"
            );
            return SYNTHETIC_FALLBACK_PRICE;
        }

        try {
            let resolvedSymbol = String(hints.symbolHint || "").trim();
            let resolvedName = String(hints.nameHint || "").trim();
            if (instrumentStore.isReady()) {
                const instrument = instrumentStore.getByToken(token);
                if (instrument) {
                    if (!resolvedSymbol) resolvedSymbol = instrument.tradingsymbol;
                    if (!resolvedName) resolvedName = instrument.name;
                }
            }

            const liveCandidates = [token, resolvedSymbol, resolvedName];
            for (const candidate of liveCandidates) {
                if (!candidate) continue;
                const liveQuote = realTimeMarketService.getQuote(candidate);
                const livePrice = toPrice(liveQuote?.price);
                if (livePrice !== null) return livePrice;
            }

            const simulationCandidates = [resolvedSymbol, resolvedName];
            for (const candidate of simulationCandidates) {
                if (!candidate) continue;
                const simulationQuote = marketSimulation.getQuote(candidate);
                const simulationPrice = toPrice(simulationQuote?.price);
                if (simulationPrice !== null) return simulationPrice;
            }

            let snapshotDetail: SystemQuoteDetail | null = null;
            try {
                snapshotDetail = await this.getSnapshotDetail(token);
            } catch (error) {
                logger.warn(
                    { err: error, instrumentToken: token },
                    "Snapshot price lookup failed in PriceOracle"
                );
            }

            const snapshotPrice = toPrice(snapshotDetail?.lastPrice);
            if (snapshotPrice !== null) return snapshotPrice;

            const closePrice = toPrice(snapshotDetail?.closePrice);
            if (closePrice !== null) return closePrice;
        } catch (error) {
            logger.warn(
                { err: error, instrumentToken: token },
                "PriceOracle ladder failed, using synthetic fallback"
            );
        }

        logger.error(
            { instrumentToken: token, fallbackPrice: SYNTHETIC_FALLBACK_PRICE },
            "Using synthetic fallback price"
        );
        return SYNTHETIC_FALLBACK_PRICE;
    }
}

export const priceOracle = new PriceOracleService();
