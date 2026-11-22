import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAddCompany,
  canPerformAction,
  canUploadXml,
  computeRoi,
  gateBanks,
  PLANS,
  priceBreakdown,
  requiredPlanFor,
  riskAlerts,
  splitUploadsByLimit,
  yearlySavings,
} from "./pricing.ts";

test("prices: monthly / yearly and the 20% yearly saving", () => {
  assert.equal(PLANS.pro.price.monthly, 149);
  assert.equal(PLANS.pro.price.yearly, 119);
  assert.equal(PLANS.business.price.yearly, 359);
  assert.equal(yearlySavings("pro"), 360);
  assert.equal(yearlySavings("business"), 1080);
  assert.equal(yearlySavings("starter"), 0);
});

test("priceBreakdown adds 21% VAT on the billed period", () => {
  const m = priceBreakdown("pro", "monthly");
  assert.deepEqual([m.net, m.vat, m.gross], [149, 31.29, 180.29]);
  const y = priceBreakdown("pro", "yearly");
  assert.equal(y.months, 12);
  assert.equal(y.net, 1428);
  assert.equal(y.gross, 1727.88);
});

test("starter: 3 XML uploads, the 4th needs an upgrade", () => {
  assert.equal(canUploadXml("starter", 2).allowed, true);
  assert.equal(canUploadXml("starter", 3).allowed, false);
  assert.equal(canUploadXml("pro", 500).allowed, true);
  const split = splitUploadsByLimit("starter", 1, ["a", "b", "c"]);
  assert.deepEqual(split, { accepted: ["a", "b"], rejected: ["c"] });
});

test("company limits: 1 / 3 / unlimited", () => {
  assert.equal(canAddCompany("starter", 1).allowed, false);
  assert.equal(canAddCompany("pro", 2).allowed, true);
  assert.equal(canAddCompany("pro", 3).allowed, false);
  assert.equal(canAddCompany("business", 999).allowed, true);
});

test("feature gating and the lowest plan that unlocks a feature", () => {
  assert.equal(canPerformAction("starter", "exportPdf"), false);
  assert.equal(canPerformAction("pro", "exportPdf"), true);
  assert.equal(canPerformAction("pro", "riskAlerts"), false);
  assert.equal(requiredPlanFor("allBankRecommendations"), "pro");
  assert.equal(requiredPlanFor("riskAlerts"), "business");
  assert.deepEqual(gateBanks("starter", [1, 2, 3]), { visible: [1], locked: [2, 3] });
  assert.deepEqual(gateBanks("pro", [1, 2, 3]), { visible: [1, 2, 3], locked: [] });
});

test("risk alerts only on Business, at the documented thresholds", () => {
  const m = { dscr: 1.2, topClientSharePct: 45, creditNotesSharePct: 6 };
  assert.equal(riskAlerts("pro", m).length, 0);
  assert.equal(riskAlerts("business", m).length, 3);
  assert.equal(riskAlerts("business", { dscr: 1.5, topClientSharePct: 20, creditNotesSharePct: 1 }).length, 0);
});

test("ROI vs. consultant: 1 file + 10 hours a year on Pro yearly", () => {
  // 1 × 1000 EUR × 5 + 10 × 525 RON = 10250 RON consulting; platform 119 × 12 = 1428 RON
  const r = computeRoi({ filesPerYear: 1, hoursPerYear: 10 });
  assert.equal(r.consultingRon, 10250);
  assert.equal(r.platformRon, 1428);
  assert.equal(r.savingsRon, 8822);
  assert.equal(r.savingsEur, 1764);
  assert.equal(computeRoi({ filesPerYear: 0, hoursPerYear: 0 }).savingsRon, 0);
});
