// Run with: npm test — BCR formulas, optional CUI/CAEN, multi-company isolation, bank matcher.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeAssessment } from "./assessment.ts";
import { matchBanks } from "./bank-matcher.ts";
import {
  annuityInstallment,
  concentrationScore,
  cvScore,
  dscrScore,
  dsoBandScore,
  paymentBehaviourScore,
  principalForInstallment,
  resilienceScore,
} from "./bcr-formulas.ts";
import { companyKey, findExistingCompany, isSameParty, normalizeCompanyName } from "./company.ts";
import { findSector, resolveSector, sectorForCaen } from "./data/benchmarks.ts";
import { DEMO_COMPANY, fixtureCompanyRecord, syntheticDataset, syntheticInvoicesFor } from "./data/test-fixtures.ts";
import { parseEFacturaXml } from "./efactura/parser.ts";
import { calculateFinalScore } from "./scoring.ts";
import type { InvestmentInput, QuizAnswers } from "../types/scoring";

const quiz: QuizAnswers = { revenueEstimate: 2_000_000, paymentTerm: "30", topClientShare: "15-30", mainSupplier: "Lactate Transilvania SRL", hasSignificantCreditNotes: false };
const investment: InvestmentInput = { purpose: "growth", ownContributionPct: 15, requestedAmount: 900_000 };
const xml = (f: string) => readFileSync(new URL(`./data/test-xml/${f}`, import.meta.url), "utf8");

test("annuity and its inverse", () => {
  const r = annuityInstallment(900_000, 0.095, 60);
  assert.equal(Math.round(r), 18902);
  assert.equal(Math.round(principalForInstallment(r, 0.095, 60)), 900_000);
  assert.equal(annuityInstallment(0), 0);
});

test("S_Business bands match the BCR spec exactly", () => {
  assert.deepEqual([0.1, 0.149, 0.15, 0.3, 0.31, 0.5, 0.51].map(cvScore), [100, 100, 75, 75, 45, 45, 20]);
  assert.deepEqual([1.6, 1.5, 1.49, 1.25, 1.24, 1.1, 1.09, 1.0, 0.99].map(dscrScore), [100, 100, 80, 80, 55, 55, 30, 30, 0]);
  assert.deepEqual([10, 15, 16, 30, 31, 45, 46, 60, 61].map(dsoBandScore), [100, 100, 80, 80, 55, 55, 30, 30, 10]);
  assert.deepEqual([10, 14.9, 15, 30, 30.1, 50, 50.1].map(concentrationScore), [100, 100, 80, 80, 45, 45, 15]);
  assert.deepEqual([1.3, 1.1, 1.0, 0.9, 0.5].map(resilienceScore), [100, 80, 60, 35, 10]);
  assert.deepEqual(paymentBehaviourScore(20, 6), { score: 65, base: 80, penalty: true });
  assert.deepEqual(paymentBehaviourScore(70, 9), { score: 0, base: 10, penalty: true });
  assert.equal(paymentBehaviourScore(20, 5).penalty, false);
});

test("final formula: weights, clamp and kill-switch at quiz <= 34", () => {
  const base = { sBusiness: 80, legalScore: 100, investmentFormScore: 100, benchmarkScore: 60 };
  const ok = calculateFinalScore({ ...base, quizScore: 35 });
  assert.equal(ok.quizKillSwitch, false);
  assert.equal(ok.finalScore, Math.round((0.7 * 80 + 0.15 * (0.5 * 35 + 50) + 0.15 * 80) * 10) / 10);
  const ks = calculateFinalScore({ ...base, quizScore: 34 });
  assert.equal(ks.quizKillSwitch, true);
  assert.equal(ks.finalScore, Math.round((ks.rawScore - 10) * 10) / 10);
  const floor = calculateFinalScore({ sBusiness: 0, quizScore: 0, legalScore: 0, investmentFormScore: 0, benchmarkScore: 0 });
  assert.equal(floor.finalScore, 0);
});

test("CAEN → sector mapping, dropdown fallback, General IMM default", () => {
  assert.equal(sectorForCaen("5610"), "5610");
  assert.equal(sectorForCaen("5630"), "5610");
  assert.equal(sectorForCaen("4690"), "4639");
  assert.equal(sectorForCaen("6201"), "6201");
  assert.equal(sectorForCaen("CAEN 6202 - consultanță IT"), "6201");
  assert.equal(sectorForCaen(""), null);
  assert.equal(sectorForCaen("9999"), null);
  assert.equal(resolveSector({ caenCode: "5610", sector: "6201" }).sector.caenCode, "5610");
  assert.equal(resolveSector({ caenCode: "", sector: "6201" }).source, "manual");
  assert.equal(resolveSector({ caenCode: "" }).sector.caenCode, "IMM");
  assert.equal(findSector("nope").caenCode, "IMM");
});

test("company names are matched without CUI: SRL / SC / dots / case / diacritics ignored", () => {
  assert.equal(normalizeCompanyName("S.C. Nord  Fresh Distribuție S.R.L."), "nord fresh distributie");
  assert.equal(normalizeCompanyName("NORD FRESH DISTRIBUTIE SRL"), "nord fresh distributie");
  assert.equal(companyKey({ name: "X", cui: "ro 123" }), "cui:123");
  assert.equal(companyKey({ name: "Bistro La Mama SRL", cui: "" }), "name:bistro la mama");
  assert.ok(isSameParty({ name: "SC Bistro La Mama S.R.L.", cui: "" }, { name: "bistro la mama srl", cui: "" }));
  assert.ok(isSameParty({ name: "Alt Nume", cui: "RO123" }, { name: "Bistro", cui: "123" }), "CUI wins when both have one");
  assert.ok(!isSameParty({ name: "Bistro La Mama", cui: "RO999" }, { name: "Bistro La Mama", cui: "RO123" }));
  const list = [{ id: "a", name: "Bistro La Mama SRL", cui: "" }, { id: "b", name: "Nord Fresh", cui: "RO45127893" }];
  assert.equal(findExistingCompany(list, { name: "SC BISTRO LA MAMA S.R.L.", cui: "" })?.id, "a");
  assert.equal(findExistingCompany(list, { name: "Alt nume", cui: "45127893" })?.id, "b");
  assert.equal(findExistingCompany(list, { name: "Firmă nouă", cui: "" }), undefined);
});

test("a company without CUI/CAEN gets its own deterministic history and a full assessment", () => {
  const c = fixtureCompanyRecord({ id: "11111111-2222-4333-8444-555555555555", name: "Bistro La Mama S.R.L.", cui: "", caenCode: "", sector: "5610", ceoName: "Ana Pop" });
  const inv = syntheticInvoicesFor(c);
  assert.ok(inv.length > 300);
  assert.ok(inv.every((i) => (i.direction === "issued" ? i.supplierName === c.name : i.customerName === c.name)));
  assert.deepEqual(syntheticInvoicesFor({ ...c }), inv, "same id → same invoices");
  const a = computeAssessment({ company: c, invoices: inv, quiz, investment, legal: null });
  assert.equal(a.benchmark.sector.caenCode, "5610");
  assert.equal(a.sectorSource, "manual");
  assert.ok(a.final.finalScore > 0 && a.final.finalScore <= 100);
  // Demo company history is unchanged by the refactor.
  assert.equal(syntheticInvoicesFor(DEMO_COMPANY).length, syntheticDataset().invoices.length);
});

test("XML upload is matched by name when the company has no CUI, and only changes that company", () => {
  const demo = syntheticDataset();
  const other = fixtureCompanyRecord({ id: "22222222-2222-4333-8444-555555555555", name: "Casa Bunicii HoReCa SRL", cui: "", caenCode: "5610", ceoName: "Ion Pop" });
  // 01_factura_normala.xml: Nord Fresh (supplier) → Casa Bunicii HoReCa SRL (customer). For a CUI-less "Casa Bunicii" it is a purchase.
  const r = parseEFacturaXml(xml("01_factura_normala.xml"), "01.xml", other);
  assert.ok(r.ok);
  assert.equal(r.invoice!.direction, "received");
  // Same file for the demo company (by CUI) is a sale.
  const d = parseEFacturaXml(xml("01_factura_normala.xml"), "01.xml", demo.company);
  assert.equal(d.invoice!.direction, "issued");
  assert.equal(d.matchedBy, "cui");

  const demoBefore = computeAssessment({ company: demo.company, invoices: demo.invoices, quiz, investment, legal: null }).final.finalScore;
  const otherInv = syntheticInvoicesFor(other);
  const otherBefore = computeAssessment({ company: other, invoices: otherInv, quiz, investment, legal: null });
  const otherAfter = computeAssessment({ company: other, invoices: [...otherInv, r.invoice!], quiz, investment, legal: null });
  assert.notEqual(otherAfter.metrics.receivedCount, otherBefore.metrics.receivedCount);
  assert.equal(computeAssessment({ company: demo.company, invoices: demo.invoices, quiz, investment, legal: null }).final.finalScore, demoBefore);

  const storno = parseEFacturaXml(xml("02_factura_storno_381.xml"), "02.xml", demo.company);
  assert.equal(storno.invoice!.typeCode, "381");
});

test("bank matcher: Romanian catalogue, top pick + alternatives, readiness and disclaimer", () => {
  const demo = syntheticDataset();
  const a = computeAssessment({ company: demo.company, invoices: demo.invoices, quiz, investment, legal: null });
  const b = a.banks;
  assert.equal(b.all.length, 9);
  assert.ok(b.alternatives.length >= 2 && b.alternatives.length <= 3);
  assert.ok(!b.alternatives.some((x) => x.id === b.top.id));
  assert.ok(b.all.every((x, i) => i === 0 || b.all[i - 1].matchPct >= x.matchPct), "sorted by match");
  assert.ok(b.top.reasons.length >= 1 && b.top.reasons.length <= 3);
  assert.ok(b.disclaimer.includes("nu reprezintă o ofertă fermă"));
  assert.equal(b.creditReady, a.final.finalScore >= 60);

  const base = {
    finalScore: 50, operatingCashFlow: 50_000, existingMonthlyDebtService: 10_000, purpose: "working_capital" as const, ownContributionPct: 5,
    requestedAmount: 200_000, annualizedRevenue: 2_000_000, dsoDays: 70, topClientSharePct: 45, revenueCv: 0.2, seasonalityRatio: 1.3,
    resilienceRatio: 1, sector: findSector("4639"), legalScore: 100, legalCritical: false, legalPending: false,
  };
  const weak = matchBanks(base);
  assert.equal(weak.creditReady, false);
  assert.match(weak.readinessNote, /nu este încă „Credit Ready”/);
  assert.equal(weak.top.id, "bcr-factoring", "long DSO + concentrated solvent clients → factoring");

  const equipment = matchBanks({ ...base, finalScore: 75, purpose: "growth", ownContributionPct: 25, dsoDays: 20, topClientSharePct: 20 });
  assert.ok(["unicredit-leasing", "raiffeisen-investitii", "bcr-investitii", "bt-investitii"].includes(equipment.top.id));
  assert.ok(equipment.creditReady);

  const critical = matchBanks({ ...base, finalScore: 75, legalCritical: true });
  assert.equal(critical.creditReady, false);
  assert.ok(critical.all.every((x) => !x.eligible && x.matchPct <= 30));
});
