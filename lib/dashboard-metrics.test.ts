import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAnnualizedSharpeRatioFromEquityCurve,
  calculateMaxDrawdownPct,
} from "./dashboard-metrics.ts";

test("calculateMaxDrawdownPct returns 0 for empty input", () => {
  assert.equal(calculateMaxDrawdownPct([]), 0);
});

test("calculateMaxDrawdownPct computes peak-to-trough drawdown", () => {
  const result = calculateMaxDrawdownPct([
    { time: 1, value: 100000 },
    { time: 2, value: 110000 },
    { time: 3, value: 99000 },
    { time: 4, value: 105000 },
  ]);

  assert.equal(result, 10);
});

test("calculateAnnualizedSharpeRatioFromEquityCurve returns 0 for flat curve", () => {
  const base = 100000;
  const points = [
    { time: Date.UTC(2026, 1, 10, 10, 0, 0), value: base },
    { time: Date.UTC(2026, 1, 11, 10, 0, 0), value: base },
    { time: Date.UTC(2026, 1, 12, 10, 0, 0), value: base },
  ];

  assert.equal(calculateAnnualizedSharpeRatioFromEquityCurve(points), 0);
});

test("calculateAnnualizedSharpeRatioFromEquityCurve is finite for non-flat curve", () => {
  const points = [
    { time: Date.UTC(2026, 1, 10, 10, 0, 0), value: 100000 },
    { time: Date.UTC(2026, 1, 11, 10, 0, 0), value: 101000 },
    { time: Date.UTC(2026, 1, 12, 10, 0, 0), value: 100700 },
    { time: Date.UTC(2026, 1, 13, 10, 0, 0), value: 101500 },
  ];

  const sharpe = calculateAnnualizedSharpeRatioFromEquityCurve(points);
  assert.equal(Number.isFinite(sharpe), true);
});
