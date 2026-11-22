// Run with: npm test — end-to-end checks on the synthetic company and the demo XML files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeAssessment } from "./assessment.ts";
import { syntheticDataset } from "./data/test-fixtures.ts";
import { parseEFacturaXml } from "./efactura/parser.ts";
import { computeMetrics } from "./metrics.ts";
import { dscrScore, estimateInstallment, quartileScore } from "./scoringEngine.ts";
import type { InvestmentInput, Invoice, QuizAnswers } from "../types/scoring";

const { company, invoices } = syntheticDataset();
const sample = (f: string) => {
  const r = parseEFacturaXml(readFileSync(new URL(`./data/test-xml/${f}`, import.meta.url), "utf8"), f, company);
  assert.ok(r.ok, r.error);
  return r.invoice!;
};
const quiz: QuizAnswers = { revenueEstimate: 2_000_000, paymentTerm: "30", topClientShare: "15-30", mainSupplier: "Lactate Transilvania SRL", hasSignificantCreditNotes: false };
const investment: InvestmentInput = { purpose: "growth", ownContributionPct: 15, requestedAmount: 900_000 };
const assess = (list: Invoice[]) => computeAssessment({ company, invoices: list, quiz, investment, legal: null });

test("synthetic data is deterministic and covers 12 months", () => {
  const m = computeMetrics(invoices, company);
  assert.equal(m.months.length, 12);
  assert.equal(m.months[0].month, "2025-11");
  assert.equal(m.asOf, "2026-10-31");
  assert.equal(m.topClients[0].name, "Mega Retail Network SRL");
  assert.equal(m.topSuppliers[0].name, "Agroalim Distribuție SA");
  assert.ok(m.topClientSharePct > 15 && m.topClientSharePct < 30);
  assert.ok(m.creditNotesSharePct3m > 2 && m.creditNotesSharePct3m < 5);
  assert.equal(computeMetrics(syntheticDataset().invoices, company).revenue12m, m.revenue12m);
});

test("UBL parser reads the demo files", () => {
  const normal = sample("01_factura_normala.xml");
  assert.equal(normal.direction, "issued");
  assert.equal(normal.typeCode, "380");
  assert.equal(normal.taxExclusiveAmount, 18450);
  assert.equal(normal.payableAmount, 20479.5);
  assert.equal(normal.dueDate, "2026-11-06");
  assert.equal(normal.customerCui, "RO40128856");

  const storno = sample("02_factura_storno_381.xml");
  assert.equal(storno.typeCode, "381");
  assert.equal(storno.dueDate, null);

  const bad = parseEFacturaXml("<root/>", "x.xml", company);
  assert.equal(bad.ok, false);
});

test("uploading the demo XML files changes the score live", () => {
  const base = assess(invoices);
  assert.equal(base.quiz.total, 94);

  const withStorno = assess([...invoices, sample("02_factura_storno_381.xml")]);
  assert.ok(withStorno.metrics.creditNotesSharePct3m > 5, "storno pushes the 3-month rate over 5%");
  assert.equal(withStorno.quiz.items.find((i) => i.id === "creditNotes")!.points, 0, "quiz answer 'Nu' becomes wrong");
  assert.ok(withStorno.final.finalScore < base.final.finalScore);

  const withBig = assess([...invoices, sample("03_factura_mare_concentrare.xml")]);
  assert.ok(withBig.metrics.topClientSharePct > 30, "big invoice moves client #1 above 30%");
  assert.equal(withBig.quiz.items.find((i) => i.id === "topClientShare")!.points, 10);
  assert.ok(withBig.plan.some((a) => a.id === "concentration"));
});

test("action plan always has 3-5 items", () => {
  const a = assess(invoices);
  assert.ok(a.plan.length >= 3 && a.plan.length <= 5);
  const bad = computeAssessment({ company, invoices, quiz: { ...quiz, revenueEstimate: 1 }, investment: { purpose: "refinancing", ownContributionPct: 0, requestedAmount: 8_000_000 }, legal: null });
  assert.ok(bad.plan.some((x) => x.id === "amount"));
  assert.ok(bad.final.warnings.some((w) => w.includes("supraîndatorare")));
});

test("helpers: installment, DSCR and quartile scoring", () => {
  assert.equal(Math.round(estimateInstallment(900_000)), 18902);
  assert.equal(dscrScore(1.0), 30);
  assert.equal(dscrScore(1.5), 100);
  assert.equal(dscrScore(1.3), 80);
  assert.equal(quartileScore(30, [30, 42, 58], false), 100);
  assert.equal(quartileScore(42, [30, 42, 58], false), 60);
  assert.equal(quartileScore(19, [14, 19, 24], true), 60);
  assert.equal(quartileScore(24, [14, 19, 24], true), 100);
});

test("consultant layer: no conclusion and no sustainable amount without real inputs", async () => {
  const { consultantConclusion, sustainableAmount, documentsFor, financingInstruments } = await import("./consultant.ts");
  const { newCompanyRecord } = await import("./company.ts");
  const { computeAssessment } = await import("./assessment.ts");
  const company = newCompanyRecord({ id: "c1", name: "Firmă Nouă SRL", cui: "", caenCode: "", ceoName: "Ana Pop" });
  const investment = { purpose: "growth" as const, ownContributionPct: 20, requestedAmount: 100_000 };
  const a = computeAssessment({ company, invoices: [], quiz: { revenueEstimate: null, paymentTerm: null, topClientShare: null, mainSupplier: null, hasSignificantCreditNotes: null }, investment, legal: null });
  const input = { company, investment, legal: null, bilant: [], ageMonths: null };
  assert.equal(a.final.complete, false);
  assert.ok((a.final.missing ?? []).length >= 2);
  assert.equal(sustainableAmount(a, input), 0);
  assert.equal(consultantConclusion(a, input).ready, false);
  assert.ok(documentsFor(input).some((d) => d.id === "oferte"));
  assert.ok(financingInstruments(a, input).some((i) => i.id === "leasing"));
});

test("consultant layer on a complete fixture profile: sustainable amount, questions and conclusion", async () => {
  const { consultantConclusion, sustainableAmount, bankQuestions } = await import("./consultant.ts");
  const { syntheticDataset: ds } = await import("./data/test-fixtures.ts");
  const d = ds();
  const investment = { purpose: "growth" as const, ownContributionPct: 15, requestedAmount: 900_000, termMonths: 60 };
  const quiz = { revenueEstimate: 2_000_000, paymentTerm: "30" as const, topClientShare: "15-30" as const, mainSupplier: null, hasSignificantCreditNotes: false };
  const legal = { query: { companyName: d.company.name, ceoName: "" }, source: "portal.just.ro" as const, isFallback: false, cases: [], totalFound: 0, excludedCount: 0, criticalCount: 0, totalDeduction: 0, minorCapApplied: false, legalScore: 100, integrityKillSwitch: false, message: "", checkedAt: "2026-11-01T00:00:00Z" };
  const a = computeAssessment({ company: d.company, invoices: d.invoices, quiz, investment, legal });
  const input = { company: d.company, investment, legal, bilant: [], ageMonths: 60 };
  assert.equal(a.final.complete, true);
  const max = sustainableAmount(a, input);
  assert.ok(max > 0 && max % 1000 === 0);
  assert.ok(bankQuestions(a, input).length >= 1);
  const c = consultantConclusion(a, input);
  assert.equal(c.ready, true);
  assert.match(c.text, /Scor/);
});
