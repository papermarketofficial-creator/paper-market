import { orders, type Instrument } from "@/lib/db/schema";
import { marketSimulation } from "@/services/market-simulation.service";
import { realTimeMarketService } from "@/services/realtime-market.service";

export interface SlippageModel {
    getSlippageBps(instrument: Instrument): number;
}

type TickDataSource = "REALTIME" | "SIMULATION" | "NONE";
type TickDataSourceExtended = TickDataSource | "SETTLEMENT";
type FillReason = "FILLABLE" | "NO_TICK" | "LIMIT_NOT_REACHED" | "INVALID_LIMIT_PRICE";

export type FillDecision = {
    shouldFill: boolean;
    executionPrice: number | null;
    fillableQuantity: number;
    tickPrice: number | null;
    tickTimestampMs: number | null;
    slippageBps: number;
    source: TickDataSourceExtended;
    reason: FillReason;
    resolvedBy: "FILL_ENGINE_V1";
};

type DbOrder = typeof orders.$inferSelect;
const FILL_TICK_MAX_AGE_MS = Number(process.env.FILL_TICK_MAX_AGE_SECONDS ?? "8") * 1000;

class TieredSlippageModel implements SlippageModel {
    private readonly equityBps = this.readBps("FILL_SLIPPAGE_BPS_EQUITY", 5);
    private readonly futuresBps = this.readBps("FILL_SLIPPAGE_BPS_FUTURES", 10);
    private readonly optionsBps = this.readBps("FILL_SLIPPAGE_BPS_OPTIONS", 15);

    getSlippageBps(instrument: Instrument): number {
        if (instrument.instrumentType === "OPTION") return this.optionsBps;
        if (instrument.instrumentType === "FUTURE") return this.futuresBps;
        return this.equityBps;
    }

    private readBps(envName: string, fallback: number): number {
        const raw = Number(process.env[envName]);
        if (!Number.isFinite(raw)) return fallback;
        return Math.min(15, Math.max(5, raw));
    }
}

export class FillEngineService {
    private static slippageModel: SlippageModel = new TieredSlippageModel();

    static setSlippageModel(model: SlippageModel): void {
        this.slippageModel = model;
    }

    static resolveFill(order: DbOrder, instrument: Instrument): FillDecision {
        if (order.orderType === "MARKET" && order.exitReason === "EXPIRY") {
            const settlementPrice = Number(order.limitPrice);
            if (Number.isFinite(settlementPrice) && settlementPrice > 0) {
                const executionPrice = this.roundForLimit(settlementPrice, instrument.tickSize, order.side);
                return {
                    shouldFill: executionPrice > 0,
                    executionPrice: executionPrice > 0 ? executionPrice : null,
                    fillableQuantity: executionPrice > 0 ? order.quantity : 0,
                    tickPrice: settlementPrice,
                    tickTimestampMs: Date.now(),
                    slippageBps: 0,
                    source: "SETTLEMENT",
                    reason: executionPrice > 0 ? "FILLABLE" : "NO_TICK",
                    resolvedBy: "FILL_ENGINE_V1",
                };
            }
        }

        const tick = this.resolveTick(instrument);
        if (!tick) {
            return {
                shouldFill: false,
                executionPrice: null,
                fillableQuantity: 0,
                tickPrice: null,
                tickTimestampMs: null,
                slippageBps: 0,
                source: "NONE",
                reason: "NO_TICK",
                resolvedBy: "FILL_ENGINE_V1",
            };
        }

        if (order.orderType === "MARKET") {
            const slippageBps = this.slippageModel.getSlippageBps(instrument);
            const direction = order.side === "BUY" ? 1 : -1;
            const slipped = tick.price * (1 + direction * (slippageBps / 10_000));
            const executionPrice = this.roundForMarket(slipped, instrument.tickSize, order.side);

            return {
                shouldFill: executionPrice > 0,
                executionPrice: executionPrice > 0 ? executionPrice : null,
                fillableQuantity: executionPrice > 0 ? order.quantity : 0,
                tickPrice: tick.price,
                tickTimestampMs: tick.timestampMs,
                slippageBps,
                source: tick.source,
                reason: executionPrice > 0 ? "FILLABLE" : "NO_TICK",
                resolvedBy: "FILL_ENGINE_V1",
            };
        }

        const limitPrice = Number(order.limitPrice);
        if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
            return {
                shouldFill: false,
                executionPrice: null,
                fillableQuantity: 0,
                tickPrice: tick.price,
                tickTimestampMs: tick.timestampMs,
                slippageBps: 0,
                source: tick.source,
                reason: "INVALID_LIMIT_PRICE",
                resolvedBy: "FILL_ENGINE_V1",
            };
        }

        const canFill =
            order.side === "BUY"
                ? tick.price <= limitPrice
                : tick.price >= limitPrice;

        if (!canFill) {
            return {
                shouldFill: false,
                executionPrice: null,
                fillableQuantity: 0,
                tickPrice: tick.price,
                tickTimestampMs: tick.timestampMs,
                slippageBps: 0,
                source: tick.source,
                reason: "LIMIT_NOT_REACHED",
                resolvedBy: "FILL_ENGINE_V1",
            };
        }

        const executionPrice = this.roundForLimit(tick.price, instrument.tickSize, order.side);
        return {
            shouldFill: executionPrice > 0,
            executionPrice: executionPrice > 0 ? executionPrice : null,
            fillableQuantity: executionPrice > 0 ? order.quantity : 0,
            tickPrice: tick.price,
            tickTimestampMs: tick.timestampMs,
            slippageBps: 0,
            source: tick.source,
            reason: executionPrice > 0 ? "FILLABLE" : "NO_TICK",
            resolvedBy: "FILL_ENGINE_V1",
        };
    }

    private static resolveTick(instrument: Instrument): { price: number; timestampMs: number | null; source: TickDataSource } | null {
        const candidates = [
            realTimeMarketService.getQuote(instrument.instrumentToken),
            realTimeMarketService.getQuote(instrument.tradingsymbol),
            realTimeMarketService.getQuote(instrument.name),
        ];

        for (const liveQuote of candidates) {
            if (!liveQuote || !Number.isFinite(liveQuote.price) || liveQuote.price <= 0) continue;
            const timestampMs = liveQuote.lastUpdated instanceof Date ? liveQuote.lastUpdated.getTime() : null;
            const ageMs = timestampMs ? Date.now() - timestampMs : Number.POSITIVE_INFINITY;
            if (!timestampMs || !Number.isFinite(ageMs) || ageMs < -5000 || ageMs > FILL_TICK_MAX_AGE_MS) {
                continue;
            }
            return {
                price: Number(liveQuote.price),
                timestampMs,
                source: "REALTIME",
            };
        }

        const simulatedQuote =
            marketSimulation.getQuote(instrument.tradingsymbol) ||
            marketSimulation.getQuote(instrument.name);
        if (simulatedQuote && Number.isFinite(simulatedQuote.price) && simulatedQuote.price > 0) {
            return {
                price: Number(simulatedQuote.price),
                timestampMs: simulatedQuote.lastUpdated instanceof Date ? simulatedQuote.lastUpdated.getTime() : null,
                source: "SIMULATION",
            };
        }

        return null;
    }

    private static roundForMarket(price: number, tickSizeRaw: string, side: DbOrder["side"]): number {
        const tickSize = Number(tickSizeRaw);
        if (!Number.isFinite(price) || price <= 0) return 0;
        if (!Number.isFinite(tickSize) || tickSize <= 0) {
            return Number(price.toFixed(2));
        }

        const units = price / tickSize;
        const roundedUnits = side === "BUY"
            ? Math.ceil(units - 1e-9)
            : Math.floor(units + 1e-9);

        const rounded = Math.max(tickSize, roundedUnits * tickSize);
        return Number(rounded.toFixed(4));
    }

    private static roundForLimit(price: number, tickSizeRaw: string, side: DbOrder["side"]): number {
        const tickSize = Number(tickSizeRaw);
        if (!Number.isFinite(price) || price <= 0) return 0;
        if (!Number.isFinite(tickSize) || tickSize <= 0) {
            return Number(price.toFixed(2));
        }

        const units = price / tickSize;
        const roundedUnits = side === "BUY"
            ? Math.floor(units + 1e-9)
            : Math.ceil(units - 1e-9);

        const rounded = Math.max(tickSize, roundedUnits * tickSize);
        return Number(rounded.toFixed(4));
    }
}
