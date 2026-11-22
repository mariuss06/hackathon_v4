// Run with: npm test — the three demo plan scenarios go through the real scoring pipeline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAssessment } from "./assessment.ts";
import { buildDemoPlan, DEMO_PLAN_COMPANIES, isDemoCompanyId } from "./demo.ts";
import { scoreRealData } from "./multi-source-verifier.ts";
import { canAddCompany } from "./pricing.ts";
import type { PlanTier } from "./pricing.ts";

const TODAY = "2026-11-22";

function assessAll(tier: PlanTier) {
  return buildDemoPlan(tier, TODAY).map((d) => {
    const verification = scoreRealData(d.official, d.legal, { companyId: d.company.id, companyName: d.company.name, ceoName: d.company.ceoName });
    return { d, a: computeAssessment({ company: d.company, invoices: d.uploads, quiz: d.quiz, investment: d.investment, legal: d.legal, verification, today: TODAY }) };
  });
}

test("demo plans load 1 / 3 / 5 companies, all flagged as demo", () => {
  assert.equal(buildDemoPlan("starter", TODAY).length, 1);
  assert.equal(buildDemoPlan("pro", TODAY).length, 3);
  assert.equal(buildDemoPlan("business", TODAY).length, 5);
  for (const tier of Object.keys(DEMO_PLAN_COMPANIES) as PlanTier[]) {
    for (const d of buildDemoPlan(tier, TODAY)) assert.ok(isDemoCompanyId(d.company.id), d.company.id);
  }
});

test("every demo company produces a complete score from 12 months of invoices", () => {
  for (const tier of ["starter", "pro", "business"] as PlanTier[]) {
    for (const { d, a } of assessAll(tier)) {
      assert.equal(a.final.complete, true, `${d.company.name}: ${(a.final.missing ?? []).join("; ")}`);
      assert.equal(a.metrics.months.length, 12, d.company.name);
      assert.ok(a.final.finalScore > 0 && a.final.finalScore <= 100, `${d.company.name}: ${a.final.finalScore}`);
    }
  }
});

test("Pro demo companies differ in score and legal status", () => {
  const rows = assessAll("pro");
  const scores = rows.map((r) => r.a.final.finalScore);
  assert.equal(new Set(scores).size, 3, `scores ${scores.join(", ")}`);
  const construct = rows.find((r) => r.d.company.name.startsWith("CONSTRUCT"))!;
  assert.ok((construct.a.legalScore ?? 100) < 100, "CONSTRUCT PRIM has an open commercial case");
});

test("Starter scenario blocks a second company, Pro blocks a fourth, Business never blocks", () => {
  assert.equal(canAddCompany("starter", 1).allowed, false);
  assert.equal(canAddCompany("pro", 3).allowed, false);
  assert.equal(canAddCompany("business", 5).allowed, true);
});
