import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateSources, scoreRealData, SOURCE_WEIGHTS } from "./multi-source-verifier.ts";
import { countyFromAnaf, emptyRealData, parseBilant } from "./real-company-sources.ts";

test("weights of the 5 real sources sum to 1", () => {
  const total = Object.values(SOURCE_WEIGHTS).reduce((s, w) => s + w, 0);
  assert.equal(Math.round(total * 1000) / 1000, 1);
});

test("sources without an answer are left out, never given an invented score", () => {
  assert.equal(aggregateSources([{ weight: 0.3, score: null }, { weight: 0.25, score: null }]), null);
  assert.equal(aggregateSources([{ weight: 0.3, score: 100 }, { weight: 0.2, score: 50 }]), 80);
  const report = scoreRealData(emptyRealData(""), null, { companyId: "x", companyName: "X SRL", ceoName: "Ion Pop" });
  assert.equal(report.aggregateScore, null);
  assert.ok(report.sources.every((s) => s.score === null));
});

test("balance sheet is parsed by label and ANAF county is mapped", () => {
  const b = parseBilant({ an: 2024, i: [{ val_den_indicator: "Cifra de afaceri neta", val_indicator: 1000 }, { val_den_indicator: "CAPITALURI - TOTAL, din care:", val_indicator: -5 }] }, 2024);
  assert.equal(b?.cifraAfaceri, 1000);
  assert.equal(b?.capitaluriProprii, -5);
  assert.equal(parseBilant({ an: 2024, i: [] }, 2024), null);
  assert.equal(countyFromAnaf("MUNICIPIUL BUCUREŞTI"), "București");
});

test("insolvency signal only for the firm's own insolvency (critical case), not as creditor / intimat", async () => {
  const { onrcBpiFrom } = await import("./real-company-sources.ts");
  const anaf = { cui: "1", denumire: "X SA", nrRegCom: "J1", adresa: "", codCaen: "", telefon: "", stareInregistrare: "INREGISTRAT din data 01.01.2010", dataInregistrare: "2010-01-01", formaJuridica: "", scpTva: true, tvaLaIncasare: false, splitTva: false, eFactura: true, inactiv: false, dataInactivare: "", dataReactivare: "", dataRadiere: "", judet: "", localitate: "" };
  const base = { numar: "1/3/2020", institutie: "Tribunalul București", data: "", obiect: "procedura insolvenţei", categorie: "Faliment", stadiu: "Fond", parti: [], matchedBy: "firma" as const, partyRoles: ["Intimat"], isCritical: false, kind: "insolventa" as const, kindLabel: "", outcome: "castigat" as const, outcomeLabel: "", isFinal: null, decisionDate: "", nextHearing: "", verdictExcerpt: "", severity: 1 as const, severityLabel: "", deduction: 3, reasons: [] };
  const legal = { query: { companyName: "X SA", ceoName: "" }, source: "portal.just.ro" as const, isFallback: false, cases: [{ ...base, roleCategory: "necunoscut" as const }], totalFound: 1, excludedCount: 0, criticalCount: 0, totalDeduction: 3, minorCapApplied: false, legalScore: 97, integrityKillSwitch: false, message: "", checkedAt: "2026-11-21T00:00:00Z" };
  assert.equal(onrcBpiFrom(anaf, legal, "1", "2026-11-21T00:00:00Z").data?.insolventa.length, 0);
  const own = { ...legal, cases: [{ ...base, roleCategory: "vizat" as const, partyRoles: ["Debitor"], severity: 4 as const, isCritical: true }] };
  assert.equal(onrcBpiFrom(anaf, own, "1", "2026-11-21T00:00:00Z").data?.insolventa.length, 1);
});
