import "dotenv/config";
import assert from "node:assert/strict";
import { MarginCurveService } from "../services/margin-curve.service.js";

function run(): void {
    const curve = new MarginCurveService();
    const cfg = curve.getConfig();

    const lowRequired = Math.max(1, cfg.tier1MaxRequiredMargin - 1);
    const midRequired = cfg.tier1MaxRequiredMargin + Math.max(1, Math.floor((cfg.tier2MaxRequiredMargin - cfg.tier1MaxRequiredMargin) / 2));
    const highRequired = cfg.tier2MaxRequiredMargin + 100_000;

    const lowMaintenance = curve.getMaintenanceMargin(lowRequired);
    const midMaintenance = curve.getMaintenanceMargin(midRequired);
    const highMaintenance = curve.getMaintenanceMargin(highRequired);

    assert(lowMaintenance < midMaintenance, "Maintenance must increase from low tier to mid tier");
    assert(midMaintenance < highMaintenance, "Maintenance must increase from mid tier to high tier");

    const flatRatio = 0.5;
    const testEquityMid = Math.max(1, curve.getMaintenanceMargin(midRequired) - 1);
    const tieredMidEligible = curve.isImmediateLiquidationEligible(testEquityMid, midRequired);
    const flatMidEligible = (midRequired * flatRatio) >= testEquityMid;

    assert(tieredMidEligible, "Tiered model should trigger liquidation at configured maintenance threshold");
    assert(!flatMidEligible, "Flat 50% model would delay liquidation for mid-tier exposure");

    const testEquityHigh = Math.max(1, curve.getMaintenanceMargin(highRequired) - 1);
    const tieredHighEligible = curve.isImmediateLiquidationEligible(testEquityHigh, highRequired);
    const flatHighEligible = (highRequired * flatRatio) >= testEquityHigh;
    const tieredHeadroom = testEquityHigh - highMaintenance;
    const flatHeadroom = testEquityHigh - (highRequired * flatRatio);

    assert(tieredHighEligible, "High-tier exposure should be liquidation-eligible sooner under tiered curve");
    assert(!flatHighEligible, "Flat 50% should remain less protective at high exposure");
    assert(tieredHeadroom < flatHeadroom, "Tiered curve must enforce tighter equity protection headroom");

    console.log("Margin Curve Test");
    console.log("=".repeat(60));
    console.log(`Config tiers: <${cfg.tier1MaxRequiredMargin} => ${cfg.tier1Ratio}, <=${cfg.tier2MaxRequiredMargin} => ${cfg.tier2Ratio}, >${cfg.tier2MaxRequiredMargin} => ${cfg.tier3Ratio}`);
    console.log(`1) PASS maintenance rises with exposure: low=${lowMaintenance.toFixed(2)}, mid=${midMaintenance.toFixed(2)}, high=${highMaintenance.toFixed(2)}`);
    console.log(`2) PASS liquidation triggers earlier than flat 50% at mid-tier exposure`);
    console.log(`3) PASS equity protection improves at high exposure (tiered headroom=${tieredHeadroom.toFixed(2)}, flat headroom=${flatHeadroom.toFixed(2)})`);
}

try {
    run();
    process.exit(0);
} catch (error) {
    console.error("Margin curve verification failed:", error);
    process.exit(1);
}
