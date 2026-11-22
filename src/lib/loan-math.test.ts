import { test } from "node:test";
import assert from "node:assert/strict";
import { cashFreedByDso, loanCostBreakdown, maxLoanAmount, maxSafeInstallment, seasonalityMap } from "./loan-math.ts";
import type { MonthPoint } from "../types/scoring";

test("loan breakdown: VAT, own contribution, annuity and interest totals", () => {
  const b = loanCostBreakdown({ netAmount: 100_000, vatRate: 0.21, ownContributionPct: 0, annualRatePct: 9.5, months: 60 });
  assert.equal(b.vat, 21_000);
  assert.equal(b.totalWithVat, 121_000);
  assert.equal(b.financed, 100_000); // VAT payer: the bank finances the net value
  assert.ok(Math.abs(b.monthlyInstallment - 2100.19) < 0.5, `installment ${b.monthlyInstallment}`);
  assert.ok(Math.abs(b.totalRepaid - b.monthlyInstallment * 60) < 1);
  assert.ok(Math.abs(b.totalInterest - (b.totalRepaid - 100_000)) < 1);
  const own = loanCostBreakdown({ netAmount: 100_000, vatRate: 0.21, ownContributionPct: 20, annualRatePct: 9.5, months: 60 });
  assert.equal(own.ownContribution, 24_200);
  assert.equal(own.financed, 75_800);
});

test("safe installment keeps DSCR at 1.25 and maps to a principal", () => {
  assert.equal(maxSafeInstallment(25_000, 5_000), 15_000);
  assert.equal(maxSafeInstallment(5_000, 5_000), 0);
  const p = maxLoanAmount(2100.19, 60, 0.095);
  assert.ok(Math.abs(p - 100_000) <= 1000, `principal ${p}`);
});

test("cash freed by a shorter DSO", () => {
  assert.equal(cashFreedByDso(3_650_000, 52, 30), 220_000);
});

test("seasonality map flags months that cannot pay the installment", () => {
  const months: MonthPoint[] = [
    { month: "2026-01", revenue: 0, uploadedRevenue: 0, purchases: 0, netCashFlow: 500 },
    { month: "2026-02", revenue: 0, uploadedRevenue: 0, purchases: 0, netCashFlow: 1_100 },
    { month: "2026-03", revenue: 0, uploadedRevenue: 0, purchases: 0, netCashFlow: 3_000 },
  ];
  const m = seasonalityMap(months, 1_000);
  assert.deepEqual(m.months.map((x) => x.tone), ["red", "amber", "emerald"]);
  assert.equal(m.reserveNeeded, 500);
});
