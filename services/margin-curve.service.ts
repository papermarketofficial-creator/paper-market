const EPSILON = 0.005;

export type MarginCurveSnapshot = {
    tier1MaxRequiredMargin: number;
    tier2MaxRequiredMargin: number;
    tier1Ratio: number;
    tier2Ratio: number;
    tier3Ratio: number;
};

function toPositiveNumber(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toRatio(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(0.99, Math.max(0.01, parsed));
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

export class MarginCurveService {
    private readonly config: MarginCurveSnapshot = {
        tier1MaxRequiredMargin: toPositiveNumber(process.env.MARGIN_CURVE_TIER1_MAX, 100_000),
        tier2MaxRequiredMargin: toPositiveNumber(process.env.MARGIN_CURVE_TIER2_MAX, 500_000),
        tier1Ratio: toRatio(process.env.MARGIN_CURVE_TIER1_RATIO, 0.5),
        tier2Ratio: toRatio(process.env.MARGIN_CURVE_TIER2_RATIO, 0.65),
        tier3Ratio: toRatio(process.env.MARGIN_CURVE_TIER3_RATIO, 0.8),
    };

    constructor() {
        if (this.config.tier2MaxRequiredMargin <= this.config.tier1MaxRequiredMargin) {
            this.config.tier2MaxRequiredMargin = this.config.tier1MaxRequiredMargin + 1;
        }
        if (this.config.tier2Ratio < this.config.tier1Ratio) {
            this.config.tier2Ratio = this.config.tier1Ratio;
        }
        if (this.config.tier3Ratio < this.config.tier2Ratio) {
            this.config.tier3Ratio = this.config.tier2Ratio;
        }
    }

    getMaintenanceRatio(requiredMargin: number): number {
        const required = Number.isFinite(requiredMargin) ? Math.max(0, requiredMargin) : 0;
        if (required < this.config.tier1MaxRequiredMargin) return this.config.tier1Ratio;
        if (required <= this.config.tier2MaxRequiredMargin) return this.config.tier2Ratio;
        return this.config.tier3Ratio;
    }

    getMaintenanceMargin(requiredMargin: number): number {
        const required = Number.isFinite(requiredMargin) ? Math.max(0, requiredMargin) : 0;
        if (required <= EPSILON) return 0;
        return round2(required * this.getMaintenanceRatio(required));
    }

    isImmediateLiquidationEligible(equity: number, requiredMargin: number): boolean {
        const required = Number.isFinite(requiredMargin) ? Math.max(0, requiredMargin) : 0;
        if (required <= EPSILON) return false;
        const maintenance = this.getMaintenanceMargin(required);
        return maintenance >= Number(equity);
    }

    getConfig(): MarginCurveSnapshot {
        return { ...this.config };
    }
}

declare global {
    var __marginCurveServiceInstance: MarginCurveService | undefined;
}

const globalState = globalThis as unknown as { __marginCurveServiceInstance?: MarginCurveService };
export const marginCurveService = globalState.__marginCurveServiceInstance || new MarginCurveService();

globalState.__marginCurveServiceInstance = marginCurveService;
