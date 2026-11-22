// Run with: npm test  (Node's built-in test runner + TypeScript stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeCase,
  assessIdentity,
  calculateFinalScore,
  companyCounty,
  countyOf,
  courtCounties,
  isPreIdentityLegal,
  needsConfirmation,
  scoreLegalImpact,
  classifyCaseKind,
  classifyPartyRole,
  partyNameExact,
  evaluateFinancialQuiz,
  evaluateInvestment,
  scoreLegalCases,
  scoreRevenueEstimate,
} from "./scoringEngine.ts";
import type { QuizGroundTruth } from "../types/scoring";

const truth: QuizGroundTruth = {
  revenueLast3MonthsNoVat: 150_000,
  avgPaymentTermDays: 30,
  topClientSharePct: 38,
  topClientName: "Client SRL",
  topSuppliers: [
    { name: "C", cui: "3", purchaseValue: 30 },
    { name: "A", cui: "1", purchaseValue: 100 },
    { name: "B", cui: "2", purchaseValue: 50 },
    { name: "D", cui: "4", purchaseValue: 20 },
    { name: "E", cui: "5", purchaseValue: 10 },
  ],
  creditNotesSharePct: 2,
};

test("Q1 revenue thresholds", () => {
  assert.equal(scoreRevenueEstimate(165_000, 150_000).points, 35); // exactly 10%
  assert.equal(scoreRevenueEstimate(140_000, 150_000).points, 35);
  assert.equal(scoreRevenueEstimate(180_000, 150_000).points, 24); // exactly 20%
  assert.equal(scoreRevenueEstimate(202_500, 150_000).points, 10); // exactly 35%
  assert.equal(scoreRevenueEstimate(203_000, 150_000).points, 0);
  assert.equal(scoreRevenueEstimate(null, 150_000).points, 0);
});

test("perfect quiz = 100", () => {
  const r = evaluateFinancialQuiz(
    { revenueEstimate: 150_000, paymentTerm: "30", topClientShare: "30-50", mainSupplier: "A", hasSignificantCreditNotes: false },
    truth,
  );
  assert.equal(r.total, 100);
});

test("quiz neighbours and suppliers", () => {
  const r = evaluateFinancialQuiz(
    { revenueEstimate: 175_000, paymentTerm: "45+", topClientShare: ">50", mainSupplier: "C", hasSignificantCreditNotes: true },
    truth,
  );
  // 24 + 12 + 10 + 6 + 0
  assert.equal(r.total, 52);
  const r2 = evaluateFinancialQuiz(
    { revenueEstimate: 1, paymentTerm: "0-7", topClientShare: "<15", mainSupplier: "X", hasSignificantCreditNotes: true },
    truth,
  );
  assert.equal(r2.total, 0);
});

test("investment scoring", () => {
  const top = evaluateInvestment({ purpose: "growth", ownContributionPct: 25, requestedAmount: 150_000 }, 600_000);
  assert.equal(top.total, 100);
  const mid = evaluateInvestment({ purpose: "working_capital", ownContributionPct: 20, requestedAmount: 300_000 }, 600_000);
  assert.equal(mid.total, 35 + 20 + 12);
  const low = evaluateInvestment({ purpose: "refinancing", ownContributionPct: 5, requestedAmount: 300_001 }, 600_000);
  assert.equal(low.total, 10 + 5 + 0);
  assert.equal(low.overLeveragedRequest, true);
});

test("final score formula and quiz kill-switch", () => {
  const s = (sBusiness: number, quizScore: number, legalScore: number, investmentFormScore: number, benchmarkScore: number) =>
    calculateFinalScore({ sBusiness, quizScore, legalScore, investmentFormScore, benchmarkScore });

  const ok = s(78, 100, 100, 100, 100);
  assert.equal(ok.finalScore, 84.6); // 0.7*78 + 0.15*100 + 0.15*100
  assert.equal(ok.status, "Bank-Ready");
  assert.equal(ok.pillars.human.points, 15);

  const mixed = s(80, 60, 100, 90, 50);
  // 56 + 0.15*80 + 0.15*70 = 56 + 12 + 10.5
  assert.equal(mixed.finalScore, 78.5);

  const killed = s(78, 34, 100, 100, 100);
  // 54.6 + 0.15*67 + 15 = 79.65 -> -10 (float: 69.6499.. -> 69.6)
  assert.equal(killed.quizKillSwitch, true);
  assert.equal(killed.finalScore, 69.6);
  assert.equal(s(78, 35, 100, 100, 100).quizKillSwitch, false);

  const floor = s(0, 0, 0, 0, 0);
  assert.equal(floor.finalScore, 0);
  assert.equal(floor.status, "Risc ridicat");
});

const H = (data: string, solutie: string, solutieSumar = "", documentSedinta = "Hotarare") => ({
  data: `${data}T00:00:00`,
  solutie,
  solutieSumar,
  documentSedinta,
});
const TODAY = "2026-11-21";
const run = (obiect: string, categorie: string, roles: string[], hearings: ReturnType<typeof H>[], name = "Ducai Raul") =>
  analyzeCase({ obiect, categorie, stadiu: "Fond", partyRoles: roles, hearings, searchedName: name, today: TODAY });

test("legal score: deductions per level, minor cap, kill-switch", () => {
  assert.equal(scoreLegalCases([]).legalScore, 100);
  assert.equal(scoreLegalCases([{ severity: 2, deduction: 8 }, { severity: 3, deduction: 20 }]).legalScore, 72);
  const fines = scoreLegalCases(Array.from({ length: 6 }, () => ({ severity: 1 as const, deduction: 3 })));
  assert.equal(fines.legalScore, 91); // capped at 9
  assert.equal(fines.minorCapApplied, true);
  const crit = scoreLegalCases([{ severity: 4, deduction: 100 }]);
  assert.equal(crit.legalScore, 0);
  assert.equal(crit.integrityKillSwitch, true);
});

test("exact full-name matching (portal returns any-word matches)", () => {
  assert.equal(partyNameExact("DUCAI RAUL", "Ducai Raul"), true);
  assert.equal(partyNameExact("Raul Ducai", "Ducai Raul"), true); // order-free
  assert.equal(partyNameExact("DUCAI ANDREI", "Ducai Raul"), false); // same surname only
  assert.equal(partyNameExact("POPESCU RAUL", "Ducai Raul"), false); // same first name only
  assert.equal(partyNameExact("DUCAI RAUL ANDREI", "Ducai Raul"), false); // extra name = other person
  assert.equal(partyNameExact("ŞTEFĂNESCU ION", "Ștefănescu Ion"), true); // cedilla vs comma
  assert.equal(partyNameExact("S.C. ALFA COM S.R.L.", "Alfa Com SRL", "firma"), true);
  assert.equal(partyNameExact("SC ALFA COM SRL prin lichidator BETA IPURL", "Alfa Com", "firma"), true);
  assert.equal(partyNameExact("SC ALFA COM IMPEX SRL", "Alfa Com", "firma"), false);
  assert.equal(partyNameExact("ANY", ""), false);
});

test("court location: county and appeal regions", () => {
  assert.equal(countyOf("Judecatoria CLUJNAPOCA"), "Cluj");
  assert.equal(countyOf("Tribunalul BRASOV"), "Brașov");
  assert.equal(countyOf("Judecatoria SECTORUL3 BUCURESTI"), "București");
  assert.equal(countyOf("Judecatoria TARGUMURES"), "Mureș");
  assert.equal(countyOf("Judecatoria CURTEADEARGES"), "Argeș");
  assert.equal(countyOf("Judecatoria FAGARAS"), ""); // not a county seat: unknown, not "other county"
  assert.deepEqual(courtCounties("Curtea de Apel BRASOV"), ["Brașov", "Covasna"]);
  assert.deepEqual(courtCounties("Inalta Curte de Casatie si Justitie"), []);
  assert.equal(companyCounty({ city: "Brașov" }), "Brașov");
  assert.equal(companyCounty({ city: "Brașov", county: "" }), ""); // explicitly unknown
});

test("identity confidence without CNP", () => {
  const base = { partyNames: ["POPESCU ION", "SC ALTA FIRMA SRL"], companyName: "Alfa Com SRL", companyCounty: "Brașov" };
  assert.equal(assessIdentity({ ...base, matchedBy: "firma", institutie: "Tribunalul CLUJ" }).confidence, "ridicata");
  assert.equal(
    assessIdentity({ ...base, matchedBy: "administrator", partyNames: ["POPESCU ION", "S.C. ALFA COM S.R.L."], institutie: "Tribunalul CLUJ" }).confidence,
    "ridicata",
  ); // firm in the same case
  assert.equal(assessIdentity({ ...base, matchedBy: "administrator", institutie: "Judecatoria BRASOV" }).confidence, "medie");
  assert.equal(assessIdentity({ ...base, matchedBy: "administrator", institutie: "Curtea de Apel BRASOV" }).confidence, "medie");
  assert.equal(assessIdentity({ ...base, matchedBy: "administrator", institutie: "Judecatoria FAGARAS" }).confidence, "medie"); // unknown place
  assert.equal(assessIdentity({ ...base, matchedBy: "administrator", institutie: "Judecatoria CONSTANTA" }).confidence, "scazuta");
  assert.equal(assessIdentity({ ...base, companyCounty: "", matchedBy: "administrator", institutie: "Judecatoria CONSTANTA" }).confidence, "medie");
});

test("legal impact weighted by identity confidence and user answer", () => {
  const crit = { severity: 4 as const, deduction: 100 };
  assert.equal(scoreLegalImpact([{ ...crit, confidence: "ridicata" }]).integrityKillSwitch, true);
  assert.equal(scoreLegalImpact([crit]).integrityKillSwitch, true); // old saved results: full weight
  const probable = scoreLegalImpact([{ ...crit, confidence: "medie" }]);
  assert.equal(probable.integrityKillSwitch, false); // no kill-switch until confirmed
  assert.equal(probable.legalScore, 80); // counts as "grav" (-20)
  assert.equal(scoreLegalImpact([{ ...crit, confidence: "medie", userVerdict: "confirmat" }]).legalScore, 0);
  assert.equal(scoreLegalImpact([{ ...crit, confidence: "scazuta" }]).legalScore, 100);
  assert.equal(scoreLegalImpact([{ ...crit, confidence: "ridicata", userVerdict: "contestat" }]).legalScore, 100);
  assert.equal(scoreLegalImpact([{ severity: 2, deduction: 8, confidence: "medie" }]).legalScore, 96); // half
  assert.equal(needsConfirmation({ severity: 2, deduction: 8, confidence: "medie" }), true);
  assert.equal(needsConfirmation({ severity: 0, deduction: 0, confidence: "scazuta" }), false);
  assert.equal(needsConfirmation({ severity: 2, deduction: 8, confidence: "medie", userVerdict: "contestat" }), false);
});

test("saved results from before identity confidence are flagged for a re-check", () => {
  const cases = (list: object[]) => ({ cases: list }) as Parameters<typeof isPreIdentityLegal>[0];
  assert.equal(isPreIdentityLegal(cases([{ matchedBy: "administrator", severity: 4 }])), true);
  assert.equal(isPreIdentityLegal(cases([{ matchedBy: "administrator", severity: 4, confidence: "scazuta" }])), false);
  assert.equal(isPreIdentityLegal(cases([{ matchedBy: "firma", severity: 2 }])), false); // firm name match is certain
  assert.equal(isPreIdentityLegal(cases([])), false);
  assert.equal(isPreIdentityLegal(null), false);
});

test("party role classification", () => {
  assert.equal(classifyPartyRole("Debitor"), "vizat");
  assert.equal(classifyPartyRole("Inculpat"), "vizat");
  assert.equal(classifyPartyRole("Pârât"), "vizat");
  assert.equal(classifyPartyRole("Creditor"), "nevizat");
  assert.equal(classifyPartyRole("Parte vătămată"), "nevizat");
  assert.equal(classifyPartyRole("Intimat"), "necunoscut");
});

test("case kind classification", () => {
  assert.equal(classifyCaseKind("plângere contravenţională P.V. seria X", "Civil"), "contraventie");
  assert.equal(classifyCaseKind("evaziune fiscală (Legea 241/2005)", "Penal"), "penal_economic");
  assert.equal(classifyCaseKind("conducere fără permis (art.335 NCP)", "Penal"), "penal_usor");
  assert.equal(classifyCaseKind("furtul calificat (art.229 NCP)", "Penal"), "penal_grav");
  assert.equal(classifyCaseKind("procedura insolvenţei", "Faliment"), "insolventa");
  assert.equal(classifyCaseKind("validare poprire", "Civil"), "executare");
  assert.equal(classifyCaseKind("amendă pentru neexecutarea hotărârii", "Contencios administrativ şi fiscal"), "altele");
  assert.equal(classifyCaseKind("drepturi băneşti", "Contencios administrativ şi fiscal"), "altele");
  assert.equal(classifyCaseKind("contestaţie act administrativ fiscal", "Contencios administrativ şi fiscal"), "fiscal");
  assert.equal(classifyCaseKind("pretenţii", "Litigii cu profesioniştii"), "civil_comercial");
  assert.equal(classifyCaseKind("partaj judiciar", "Civil"), "familie_patrimoniu");
});

test("penal verdicts are read for the searched person", () => {
  const acq = run("înşelăciunea (art.244 NCP)", "Penal", ["Inculpat"], [
    H("2025-05-12", "Soluţionare", "Achită pe inculpatul DUCAI RAUL, întrucât fapta nu există. Definitivă."),
  ]);
  assert.equal(acq.outcome, "achitat");
  assert.equal(acq.severity, 0);
  assert.equal(acq.isFinal, true);

  const conv = run("înşelăciunea (art.244 NCP)", "Penal", ["Inculpat"], [
    H("2025-05-12", "Condamnare", "Condamnă pe inculpatul Ducai Raul la pedeapsa de 2 ani închisoare. Cu drept de apel."),
  ]);
  assert.equal(conv.outcome, "condamnat");
  assert.equal(conv.severity, 4);
  assert.equal(conv.isCritical, true);
  assert.equal(conv.isFinal, false);
  assert.match(conv.outcomeLabel, /2 ani închisoare/);

  const ended = run("lovirea sau alte violenţe (art.193 NCP)", "Penal", ["Inculpat"], [
    H("2024-10-25", "Încetat procesul penal", "Încetează procesul penal faţă de inculpatul Ducai Raul ca urmare a împăcării părţilor. Definitivă."),
  ]);
  assert.equal(ended.outcome, "incetat");
  assert.match(ended.outcomeLabel, /împăcarea/);
  assert.equal(ended.severity, 1);

  const deferred = run("conducere fără permis (art.335 NCP)", "Penal", ["Inculpat"], [
    H("2024-09-07", "Soluţionare", "Amână aplicarea pedepsei de 6 luni închisoare stabilite în sarcina inculpatului Ducai Raul. Definitivă."),
  ]);
  assert.equal(deferred.outcome, "vinovat_fara_pedeapsa");
  assert.equal(deferred.severity, 1);

  const pending = run("evaziune fiscală (Legea 241/2005)", "Penal", ["Inculpat"], [
    H("2027-01-15", ""),
    H("2026-10-02", "Amână cauza", "Pentru martori.", "incheieredesedinta"),
  ]);
  assert.equal(pending.outcome, "in_curs");
  assert.equal(pending.nextHearing, "2027-01-15");
  assert.equal(pending.severity, 4);

  const victim = run("înşelăciunea (art.244 NCP)", "Penal", ["Parte vătămată"], [H("2025-05-12", "Condamnare", "Condamnă pe inculpatul X.")]);
  assert.equal(victim.severity, 0);
});

test("fines are minor; annulled fines and won lawsuits cost nothing", () => {
  const kept = run("plângere contravenţională", "Civil", ["Petent"], [
    H("2025-11-04", "Respinge plângerea", "Respinge plângerea formulată de petentul Ducai Raul."),
  ]);
  assert.equal(kept.outcome, "sanctiune_mentinuta");
  assert.equal(kept.severity, 1);
  assert.equal(kept.deduction, 3);

  const annulled = run("plângere contravenţională", "Civil", ["Petent"], [
    H("2025-09-16", "Admite plângerea", "Admite plângerea formulată de petentul Ducai Raul. Anulează procesul-verbal."),
  ]);
  assert.equal(annulled.outcome, "sanctiune_anulata");
  assert.equal(annulled.severity, 0);

  const unpaid = run("transformare amendă", "Contencios administrativ şi fiscal", ["Intimat"], [
    H("2024-06-27", "Admite cererea", "Admite cererea în contradictoriu cu intimatul DUCAI RAUL. Dispune înlocuirea amenzii cu muncă în folosul comunităţii."),
  ]);
  assert.equal(unpaid.severity, 2);

  const lost = run("pretenţii", "Civil", ["Pârât"], [
    H("2026-04-08", "Admite cererea", "Admite cererea. Obligă pârâtul Ducai Raul la plata sumei de 5.000 lei."),
  ]);
  assert.equal(lost.outcome, "pierdut");
  assert.equal(lost.severity, 2);

  const won = run("pretenţii", "Civil", ["Pârât"], [H("2026-04-08", "Respinge cererea", "Respinge cererea formulată împotriva pârâtului Ducai Raul.")]);
  assert.equal(won.outcome, "castigat");
  assert.equal(won.severity, 0);

  const appealLost = run("pretenţii", "Civil", ["Apelant Pârât"], [
    H("2026-04-08", "Respinge apelul", "Respinge apelul declarat de apelantul Ducai Raul ca nefondat. Definitivă."),
  ]);
  assert.equal(appealLost.outcome, "pierdut");
});

test("insolvency of the searched company is critical, as creditor it is not", () => {
  const debtor = run("procedura insolvenţei", "Faliment", ["Debitor"], [
    H("2026-07-01", "Admite cererea", "Deschide procedura de insolvenţă împotriva debitoarei ALFA COM SRL."),
  ], "Alfa Com SRL");
  assert.equal(debtor.severity, 4);
  const creditor = run("procedura insolvenţei", "Faliment", ["Creditor"], [H("2026-07-01", "Admite cererea", "Deschide procedura.")], "Alfa Com SRL");
  assert.equal(creditor.severity, 0);
});

test("old resolved cases count half", () => {
  const old = run("pretenţii", "Civil", ["Pârât"], [H("2018-04-08", "Admite cererea", "Admite cererea. Obligă pârâtul Ducai Raul la plată.")]);
  assert.equal(old.severity, 2);
  assert.equal(old.deduction, 4);
});
