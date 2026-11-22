/**
 * Demo mode: ready-to-analyse SMEs, clearly flagged as DEMO in the UI ("[DEMO]" in every source summary).
 * Kept only in this browser (never sent to Supabase) and never re-queried against the real sources.
 *
 * Three plan scenarios for evaluators, built from the SAME types the real flow uses (Company, Invoice,
 * LegalCheckResult, CompanyRealData, QuizAnswers, InvestmentInput), so every demo company goes through the
 * real metrics, scoring engine, charts and bank matcher:
 *   starter  → 1 company  (HoReCa)
 *   pro      → 3 companies (IT, construction, retail)
 *   business → 5 companies (accounting firm portfolio)
 */
import type { CourtCase, Company, InvestmentInput, Invoice, LegalCheckResult, QuizAnswers } from "../types/scoring";
import type { PlanTier } from "./pricing.ts";
import { computeMetrics } from "./metrics.ts";
import { rescoreLegal } from "./scoringEngine.ts";
import { onrcBpiFrom, portalSource, REAL_SOURCE_META, type CompanyRealData, type RealSourceId, type RealSourceResult } from "./real-company-sources.ts";

/** Every demo company id starts with this prefix (used to tell demo data apart from real companies). */
export const DEMO_ID_PREFIX = "demo-";
export const isDemoCompanyId = (id: string | null | undefined) => Boolean(id && id.startsWith(DEMO_ID_PREFIX));

/** The original 1-click demo company (kept for backwards compatibility). */
export const DEMO_COMPANY_ID = "demo-nord-fresh-0000-4000-8000-000000000001";

interface Party {
  name: string;
  cui: string;
  share: number;
}

interface DemoLegalCase {
  matchedBy: "firma" | "administrator";
  kind: CourtCase["kind"];
  kindLabel: string;
  obiect: string;
  role: string;
  roleCategory: CourtCase["roleCategory"];
  outcome: CourtCase["outcome"];
  outcomeLabel: string;
  severity: CourtCase["severity"];
  severityLabel: string;
  deduction: number;
  institutie: string;
}

export interface DemoProfile {
  id: string;
  name: string;
  cui: string;
  caenCode: string;
  caenLabel: string;
  ceoName: string;
  city: string;
  county: string;
  regCom: string;
  registeredOn: string; // YYYY-MM-DD
  /** Average monthly sales without VAT (RON). */
  baseSales: number;
  /** 12 multipliers, oldest month first. */
  season: number[];
  clients: Party[];
  suppliers: Party[];
  /** Purchases as a share of sales. */
  purchaseRatio: number;
  /** Payment term granted to clients (days). */
  paymentTermDays: number;
  monthlyFixedCosts: number;
  existingMonthlyDebtService: number;
  /** Storno (381) as a share of one month's sales, in the last 3 months (0 = none). */
  recentStornoPct: number;
  employees: number;
  netMargin: number;
  vatOnCollection: boolean;
  legalCases: DemoLegalCase[];
  /** A well-informed administrator answers the quiz from the real figures; otherwise the answers are off. */
  quizAccurate: boolean;
  investment: InvestmentInput;
}

const SEASON_FLAT = [0.97, 0.98, 1.0, 1.01, 1.02, 1.0, 0.99, 1.0, 1.02, 1.03, 1.0, 0.98];
const SEASON_SUMMER = [0.92, 0.95, 1.0, 1.04, 1.1, 1.18, 1.22, 1.15, 1.05, 0.98, 0.94, 0.86];
const SEASON_CONSTRUCTION = [0.55, 0.7, 0.95, 1.15, 1.3, 1.35, 1.3, 1.25, 1.1, 0.95, 0.75, 0.55];
const SEASON_RETAIL = [0.9, 0.85, 0.95, 1.0, 1.0, 0.98, 0.97, 1.0, 1.02, 1.05, 1.15, 1.35];
const SEASON_AGRI = [0.45, 0.5, 0.65, 0.8, 0.95, 1.2, 1.6, 1.75, 1.45, 1.05, 0.8, 0.5];

const party = (name: string, cui: string, share: number): Party => ({ name, cui, share });

/** The demo companies. CUIs use the RO40000xxx range (not real companies). */
export const DEMO_PROFILES: Record<string, DemoProfile> = {
  bistro: {
    id: "demo-bistro-central-4000-8000-000000000101",
    name: "BISTRO CENTRAL HORECA SRL",
    cui: "RO40000101",
    caenCode: "5610",
    caenLabel: "Restaurante",
    ceoName: "Ioana Marinescu",
    city: "Cluj-Napoca",
    county: "Cluj",
    regCom: "J12/2104/2019",
    registeredOn: "2019-04-02",
    baseSales: 165_000,
    season: SEASON_SUMMER,
    clients: [
      party("EVENT PLUS ORGANIZARE SRL", "RO40000111", 0.34),
      party("CORPORATE LUNCH SRL", "RO40000112", 0.26),
      party("HOTEL ARIA CLUJ SRL", "RO40000113", 0.22),
      party("DELIVERY HUB SRL", "RO40000114", 0.18),
    ],
    suppliers: [
      party("METRO FRESH FOOD SRL", "RO40000121", 0.45),
      party("LACTATE TRANSILVANIA SRL", "RO40000122", 0.3),
      party("VINURI DEALU SRL", "RO40000123", 0.25),
    ],
    purchaseRatio: 0.52,
    paymentTermDays: 15,
    monthlyFixedCosts: 58_000,
    existingMonthlyDebtService: 6_500,
    recentStornoPct: 0,
    employees: 14,
    netMargin: 0.07,
    vatOnCollection: false,
    legalCases: [],
    quizAccurate: true,
    investment: { purpose: "growth", ownContributionPct: 20, requestedAmount: 180_000, termMonths: 48 },
  },
  codewave: {
    id: "demo-codewave-0000-4000-8000-000000000201",
    name: "CODEWAVE SOLUTIONS SRL",
    cui: "RO40000201",
    caenCode: "6201",
    caenLabel: "Activități de realizare a soft-ului la comandă",
    ceoName: "Radu Ionescu",
    city: "București",
    county: "București",
    regCom: "J40/8812/2017",
    registeredOn: "2017-06-15",
    baseSales: 310_000,
    season: SEASON_FLAT,
    clients: [
      party("FINTECH NORDIC AB SRL", "RO40000211", 0.31),
      party("RETAIL CLOUD SRL", "RO40000212", 0.24),
      party("LOGIX SYSTEMS SRL", "RO40000213", 0.2),
      party("HEALTH DATA SRL", "RO40000214", 0.15),
      party("EDU PLATFORM SRL", "RO40000215", 0.1),
    ],
    suppliers: [
      party("CLOUD INFRA RO SRL", "RO40000221", 0.5),
      party("OFFICE SPACE BUCURESTI SRL", "RO40000222", 0.3),
      party("HARDWARE DIRECT SRL", "RO40000223", 0.2),
    ],
    purchaseRatio: 0.22,
    paymentTermDays: 30,
    monthlyFixedCosts: 165_000,
    existingMonthlyDebtService: 4_000,
    recentStornoPct: 0,
    employees: 22,
    netMargin: 0.16,
    vatOnCollection: false,
    legalCases: [],
    quizAccurate: true,
    investment: { purpose: "growth", ownContributionPct: 30, requestedAmount: 450_000, termMonths: 36 },
  },
  construct: {
    id: "demo-construct-prim-4000-8000-000000000202",
    name: "CONSTRUCT PRIM SRL",
    cui: "RO40000202",
    caenCode: "4120",
    caenLabel: "Lucrări de construcții a clădirilor rezidențiale și nerezidențiale",
    ceoName: "Mihai Dumitrescu",
    city: "Iași",
    county: "Iași",
    regCom: "J22/1450/2015",
    registeredOn: "2015-03-20",
    baseSales: 540_000,
    season: SEASON_CONSTRUCTION,
    clients: [
      party("REZIDENTIAL PARC IASI SRL", "RO40000231", 0.58),
      party("PRIMA INVEST IMOBILIARE SRL", "RO40000232", 0.24),
      party("CLINICA NOVA SRL", "RO40000233", 0.18),
    ],
    suppliers: [
      party("BETON MOLDOVA SRL", "RO40000241", 0.42),
      party("OTEL CONSTRUCT SRL", "RO40000242", 0.33),
      party("UTILAJE RENT SRL", "RO40000243", 0.25),
    ],
    purchaseRatio: 0.63,
    paymentTermDays: 60,
    monthlyFixedCosts: 98_000,
    existingMonthlyDebtService: 21_000,
    recentStornoPct: 0.08,
    employees: 36,
    netMargin: 0.05,
    vatOnCollection: true,
    legalCases: [
      {
        matchedBy: "firma",
        kind: "civil_comercial",
        kindLabel: "Litigiu comercial",
        obiect: "pretenții — penalități contractuale",
        role: "Pârât",
        roleCategory: "vizat",
        outcome: "in_curs",
        outcomeLabel: "În curs de judecată",
        severity: 2,
        severityLabel: "Moderat",
        deduction: 8,
        institutie: "Tribunalul Iași",
      },
    ],
    quizAccurate: false,
    investment: { purpose: "working_capital", ownContributionPct: 10, requestedAmount: 1_200_000, termMonths: 36 },
  },
  mercur: {
    id: "demo-mercur-retail-4000-8000-000000000203",
    name: "MERCUR RETAIL SRL",
    cui: "RO40000203",
    caenCode: "4711",
    caenLabel: "Comerț cu amănuntul în magazine nespecializate",
    ceoName: "Elena Stoica",
    city: "Brașov",
    county: "Brașov",
    regCom: "J08/3320/2016",
    registeredOn: "2016-09-01",
    baseSales: 260_000,
    season: SEASON_RETAIL,
    clients: [
      party("CLIENTI PERSOANE FIZICE (BON FISCAL)", "RO40000251", 0.62),
      party("HORECA BRASOV SRL", "RO40000252", 0.2),
      party("CANTINA SCOLARA SRL", "RO40000253", 0.18),
    ],
    suppliers: [
      party("DISTRIBUTIE ALIMENTE SRL", "RO40000261", 0.38),
      party("BAUTURI CENTRU SRL", "RO40000262", 0.32),
      party("NON FOOD IMPORT SRL", "RO40000263", 0.3),
    ],
    purchaseRatio: 0.76,
    paymentTermDays: 7,
    monthlyFixedCosts: 42_000,
    existingMonthlyDebtService: 9_000,
    recentStornoPct: 0.02,
    employees: 11,
    netMargin: 0.04,
    vatOnCollection: false,
    legalCases: [],
    quizAccurate: true,
    investment: { purpose: "marketing", ownContributionPct: 15, requestedAmount: 120_000, termMonths: 36 },
  },
  nordfresh: {
    id: DEMO_COMPANY_ID,
    name: "NORD FRESH DISTRIBUTIE SRL",
    cui: "RO40000001",
    caenCode: "4639",
    caenLabel: "Comerț cu ridicata nespecializat de produse alimentare",
    ceoName: "Andrei Popescu",
    city: "Suceava",
    county: "Suceava",
    regCom: "J33/1234/2018",
    registeredOn: "2018-03-12",
    baseSales: 420_000,
    season: SEASON_SUMMER,
    clients: [
      party("ALFA RETAIL SRL", "RO40000011", 0.26),
      party("VERDE MARKET SRL", "RO40000012", 0.22),
      party("CARPAT HORECA SRL", "RO40000013", 0.19),
      party("LIDO FOOD SRL", "RO40000014", 0.18),
      party("DELTA CATERING SRL", "RO40000015", 0.15),
    ],
    suppliers: [
      party("AGRO VEST FERMA SRL", "RO40000021", 0.4),
      party("LACTA NORD SRL", "RO40000022", 0.3),
      party("TRANS FRIG LOGISTIC SRL", "RO40000023", 0.18),
      party("PACK PRO AMBALAJE SRL", "RO40000024", 0.12),
    ],
    purchaseRatio: 0.68,
    paymentTermDays: 30,
    monthlyFixedCosts: 95_000,
    existingMonthlyDebtService: 14_000,
    recentStornoPct: 0,
    employees: 24,
    netMargin: 0.065,
    vatOnCollection: false,
    legalCases: [],
    quizAccurate: true,
    investment: { purpose: "growth", ownContributionPct: 25, requestedAmount: 900_000, termMonths: 60 },
  },
  agrodelta: {
    id: "demo-agro-delta-4000-8000-000000000302",
    name: "AGRO DELTA FARM SRL",
    cui: "RO40000302",
    caenCode: "0111",
    caenLabel: "Cultivarea cerealelor, plantelor leguminoase și a plantelor producătoare de semințe oleaginoase",
    ceoName: "Gheorghe Vasile",
    city: "Tulcea",
    county: "Tulcea",
    regCom: "J36/410/2012",
    registeredOn: "2012-02-10",
    baseSales: 380_000,
    season: SEASON_AGRI,
    clients: [
      party("CEREALE EXPORT CONSTANTA SRL", "RO40000311", 0.52),
      party("MORARIT DOBROGEA SRL", "RO40000312", 0.28),
      party("FURAJE SUD SRL", "RO40000313", 0.2),
    ],
    suppliers: [
      party("AGROCHIMIE ROMANIA SRL", "RO40000321", 0.45),
      party("SEMINTE PREMIUM SRL", "RO40000322", 0.3),
      party("MOTORINA AGRO SRL", "RO40000323", 0.25),
    ],
    purchaseRatio: 0.58,
    paymentTermDays: 45,
    monthlyFixedCosts: 70_000,
    existingMonthlyDebtService: 32_000,
    recentStornoPct: 0,
    employees: 9,
    netMargin: 0.09,
    vatOnCollection: false,
    legalCases: [],
    quizAccurate: true,
    investment: { purpose: "growth", ownContributionPct: 25, requestedAmount: 1_500_000, termMonths: 60 },
  },
  transeuro: {
    id: "demo-trans-euro-4000-8000-000000000303",
    name: "TRANS EURO LOGISTIC SRL",
    cui: "RO40000303",
    caenCode: "4941",
    caenLabel: "Transporturi rutiere de mărfuri",
    ceoName: "Cristian Pop",
    city: "Arad",
    county: "Arad",
    regCom: "J02/990/2014",
    registeredOn: "2014-05-22",
    baseSales: 290_000,
    season: SEASON_FLAT,
    clients: [
      party("AUTO PARTS WEST SRL", "RO40000331", 0.36),
      party("FREIGHT EUROPE SRL", "RO40000332", 0.27),
      party("RETAIL LOGISTICS SRL", "RO40000333", 0.21),
      party("FARMA DISTRIBUTIE SRL", "RO40000334", 0.16),
    ],
    suppliers: [
      party("CARBURANTI VEST SRL", "RO40000341", 0.55),
      party("SERVICE CAMIOANE SRL", "RO40000342", 0.25),
      party("ANVELOPE PRO SRL", "RO40000343", 0.2),
    ],
    purchaseRatio: 0.55,
    paymentTermDays: 45,
    monthlyFixedCosts: 62_000,
    existingMonthlyDebtService: 27_000,
    recentStornoPct: 0.06,
    employees: 18,
    netMargin: 0.035,
    vatOnCollection: false,
    legalCases: [
      {
        matchedBy: "firma",
        kind: "contraventie",
        kindLabel: "Contravenție",
        obiect: "plângere contravențională — depășire masă maximă admisă",
        role: "Petent",
        roleCategory: "vizat",
        outcome: "sanctiune_mentinuta",
        outcomeLabel: "Sancțiune menținută",
        severity: 1,
        severityLabel: "Minor",
        deduction: 3,
        institutie: "Judecătoria Arad",
      },
    ],
    quizAccurate: false,
    investment: { purpose: "refinancing", ownContributionPct: 5, requestedAmount: 700_000, termMonths: 48 },
  },
  panis: {
    id: "demo-brutaria-panis-4000-8000-000000000304",
    name: "BRUTARIA PANIS SRL",
    cui: "RO40000304",
    caenCode: "1071",
    caenLabel: "Fabricarea pâinii; fabricarea prăjiturilor și a produselor proaspete de patiserie",
    ceoName: "Maria Constantin",
    city: "Sibiu",
    county: "Sibiu",
    regCom: "J32/655/2013",
    registeredOn: "2013-07-08",
    baseSales: 210_000,
    season: [0.95, 0.93, 0.97, 1.03, 0.99, 0.98, 0.97, 0.98, 1.0, 1.01, 1.04, 1.15],
    clients: [
      party("MARKET LOCAL SIBIU SRL", "RO40000351", 0.3),
      party("SUPERMARKET TRANSILVAN SRL", "RO40000352", 0.27),
      party("CAFENELE URBAN SRL", "RO40000353", 0.23),
      party("SCOLI SI GRADINITE SRL", "RO40000354", 0.2),
    ],
    suppliers: [
      party("MORA FAINA SRL", "RO40000361", 0.5),
      party("UNT SI OUA SRL", "RO40000362", 0.3),
      party("AMBALAJE ECO SRL", "RO40000363", 0.2),
    ],
    purchaseRatio: 0.48,
    paymentTermDays: 15,
    monthlyFixedCosts: 64_000,
    existingMonthlyDebtService: 7_500,
    recentStornoPct: 0,
    employees: 19,
    netMargin: 0.08,
    vatOnCollection: false,
    legalCases: [],
    quizAccurate: true,
    investment: { purpose: "growth", ownContributionPct: 30, requestedAmount: 350_000, termMonths: 60 },
  },
};

/** Which demo companies each plan scenario loads, first one active. */
export const DEMO_PLAN_COMPANIES: Record<PlanTier, (keyof typeof DEMO_PROFILES)[]> = {
  starter: ["bistro"],
  pro: ["codewave", "construct", "mercur"],
  business: ["nordfresh", "agrodelta", "transeuro", "panis", "codewave"],
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const round2 = (n: number) => Math.round(n * 100) / 100;

function makeInvoice(p: DemoProfile, dir: Invoice["direction"], n: string, date: string, partner: { name: string; cui: string }, amount: number, typeCode = "380"): Invoice {
  const self = { name: p.name, cui: p.cui };
  const supplier = dir === "issued" ? self : partner;
  const customer = dir === "issued" ? partner : self;
  return {
    id: `${dir}:${supplier.cui}:${n}`,
    number: n,
    direction: dir,
    typeCode,
    issueDate: date,
    dueDate: addDays(date, dir === "issued" ? p.paymentTermDays : 30),
    supplierName: supplier.name,
    supplierCui: supplier.cui,
    customerName: customer.name,
    customerCui: customer.cui,
    taxExclusiveAmount: amount,
    payableAmount: round2(amount * 1.21),
    currency: "RON",
    paidDate: null,
    source: "xml-upload",
  };
}

/** 12 full months ending with the previous month: 2 sales invoices per client and 1 purchase per supplier each month. */
function demoInvoices(p: DemoProfile, today: string): Invoice[] {
  const now = new Date(`${today}T00:00:00Z`);
  const prefix = p.cui.slice(-3);
  const out: Invoice[] = [];
  let seq = 1;
  for (let i = 0; i < 12; i++) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12 + i, 1));
    const ym = iso(m).slice(0, 7);
    const sales = p.baseSales * p.season[i];
    for (const c of p.clients) {
      for (const day of ["05", "19"]) {
        out.push(makeInvoice(p, "issued", `D${prefix}-${String(seq++).padStart(5, "0")}`, `${ym}-${day}`, c, Math.round((sales * c.share) / 2)));
      }
    }
    for (const s of p.suppliers) {
      out.push(makeInvoice(p, "received", `${s.cui.slice(-2)}-${ym.replace("-", "")}`, `${ym}-10`, s, Math.round(sales * p.purchaseRatio * s.share)));
    }
    // One small storno 5 months back, plus the profile's recent storno in the last 3 months.
    if (i === 7) out.push(makeInvoice(p, "issued", `D${prefix}-${String(seq++).padStart(5, "0")}`, `${ym}-24`, p.clients[p.clients.length - 1], -Math.round(sales * 0.012), "381"));
    if (i >= 9 && p.recentStornoPct > 0) {
      out.push(makeInvoice(p, "issued", `D${prefix}-${String(seq++).padStart(5, "0")}`, `${ym}-26`, p.clients[0], -Math.round(sales * p.recentStornoPct), "381"));
    }
  }
  return out;
}

const src = (sourceId: RealSourceId, status: RealSourceResult["status"], rawSummary: string, checkedAt: string): RealSourceResult => ({
  sourceId,
  ...REAL_SOURCE_META[sourceId],
  status,
  checkedAt,
  rawSummary: `[DEMO] ${rawSummary}`,
  data: null,
});

function demoCase(p: DemoProfile, c: DemoLegalCase, today: string, i: number): CourtCase {
  const year = Number(today.slice(0, 4));
  const opened = addDays(today, -140 - i * 30);
  return {
    numar: `${1000 + i * 37}/${c.institutie.includes("Tribunal") ? "99" : "55"}/${year}`,
    institutie: c.institutie,
    data: opened,
    obiect: c.obiect,
    categorie: c.kindLabel,
    stadiu: c.outcome === "in_curs" ? "Fond" : "Definitiv",
    parti: [`${c.matchedBy === "firma" ? p.name : p.ceoName} — ${c.role}`],
    matchedBy: c.matchedBy,
    partyRoles: [c.role],
    roleCategory: c.roleCategory,
    isCritical: c.severity === 4,
    kind: c.kind,
    kindLabel: c.kindLabel,
    outcome: c.outcome,
    outcomeLabel: c.outcomeLabel,
    isFinal: c.outcome === "in_curs" ? null : true,
    decisionDate: c.outcome === "in_curs" ? "" : addDays(opened, 60),
    nextHearing: c.outcome === "in_curs" ? addDays(today, 21) : "",
    verdictExcerpt: "",
    severity: c.severity,
    severityLabel: c.severityLabel,
    deduction: c.deduction,
    reasons: [`[DEMO] ${c.kindLabel} · rol ${c.role} · ${c.outcomeLabel}.`],
    confidence: "ridicata",
    confidenceReasons: ["[DEMO] Denumirea exactă a firmei apare ca parte."],
  };
}

export interface DemoBundle {
  company: Company;
  uploads: Invoice[];
  legal: LegalCheckResult;
  official: CompanyRealData;
  quiz: QuizAnswers;
  investment: InvestmentInput;
}

/** One complete demo company (invoices, official sources, court check, both quizzes). */
export function buildDemoCompany(p: DemoProfile, today: string): DemoBundle {
  const checkedAt = new Date(`${today}T09:00:00Z`).toISOString();
  const company: Company = {
    id: p.id,
    name: p.name,
    officialName: p.name,
    cui: p.cui,
    caenCode: p.caenCode,
    sector: p.caenCode,
    ceoName: p.ceoName,
    city: p.city,
    county: p.county,
    monthlyFixedCosts: p.monthlyFixedCosts,
    existingMonthlyDebtService: p.existingMonthlyDebtService,
    financialsDeclared: true,
    debts: [],
    nameSearchConsent: true,
    createdAt: checkedAt,
  };
  const uploads = demoInvoices(p, today);

  const cases = p.legalCases.map((c, i) => demoCase(p, c, today, i));
  const legal = rescoreLegal({
    query: { companyName: p.name, ceoName: p.ceoName, companyCounty: p.county },
    source: "portal.just.ro",
    isFallback: false,
    cases,
    totalFound: cases.length,
    excludedCount: 0,
    criticalCount: 0,
    totalDeduction: 0,
    minorCapApplied: false,
    legalScore: 100,
    integrityKillSwitch: false,
    uncertainCount: 0,
    message: `[DEMO] ${cases.length} ${cases.length === 1 ? "dosar" : "dosare"} pe numele exact al firmei și al administratorului.`,
    checkedAt,
  });

  const cuiDigits = p.cui.replace(/\D/g, "");
  const anaf = {
    cui: cuiDigits,
    denumire: p.name,
    nrRegCom: p.regCom,
    adresa: `Str. Demo nr. ${cuiDigits.slice(-2)}, ${p.city}`,
    codCaen: p.caenCode,
    telefon: "",
    stareInregistrare: `INREGISTRAT din data ${p.registeredOn.split("-").reverse().join(".")}`,
    dataInregistrare: p.registeredOn,
    formaJuridica: "SOCIETATE COMERCIALĂ CU RĂSPUNDERE LIMITATĂ",
    scpTva: true,
    tvaLaIncasare: p.vatOnCollection,
    splitTva: false,
    eFactura: true,
    inactiv: false,
    dataInactivare: "",
    dataReactivare: "",
    dataRadiere: "",
    judet: p.county,
    localitate: p.city,
  };
  const year = Number(today.slice(0, 4));
  const yearlySales = p.baseSales * 12;
  const bilant = [
    { an: year - 1, cifraAfaceri: Math.round(yearlySales * 0.96), growth: 1 },
    { an: year - 2, cifraAfaceri: Math.round(yearlySales * 0.86), growth: 0.86 },
  ].map((b) => {
    const profitNet = Math.round(b.cifraAfaceri * p.netMargin);
    return {
      an: b.an,
      cifraAfaceri: b.cifraAfaceri,
      profitNet,
      datorii: Math.round(b.cifraAfaceri * (0.18 + p.existingMonthlyDebtService / p.baseSales / 2)),
      capitaluriProprii: Math.round(b.cifraAfaceri * 0.2 * b.growth),
      salariati: Math.max(1, Math.round(p.employees * b.growth)),
      denumire: p.name,
      caen: p.caenCode,
      denCaen: p.caenLabel,
      venituriTotale: Math.round(b.cifraAfaceri * 1.01),
      cheltuieliTotale: Math.round(b.cifraAfaceri * 1.01 - profitNet * 1.16),
      profitBrut: Math.round(profitNet * 1.16),
      pierdereBruta: 0,
      pierdereNeta: 0,
      activeImobilizate: Math.round(b.cifraAfaceri * 0.15),
      activeCirculante: Math.round(b.cifraAfaceri * 0.3),
      stocuri: Math.round(b.cifraAfaceri * 0.08),
      creante: Math.round(b.cifraAfaceri * (p.paymentTermDays / 365)),
      casaBanci: Math.round(b.cifraAfaceri * 0.05),
    };
  });
  const onrc = onrcBpiFrom(anaf, legal, anaf.cui, checkedAt);
  const official: CompanyRealData = {
    cui: anaf.cui,
    sources: [
      src("anaf_general", "verified", `Plătitor TVA${p.vatOnCollection ? " (TVA la încasare)" : ""}, înregistrat în RO e-Factura, activ fiscal.`, checkedAt),
      src("anaf_bilant", "verified", `Bilanțuri ${year - 2}–${year - 1} depuse; profit în ambii ani.`, checkedAt),
      portalSource(legal, checkedAt),
      src("vies_eu", "verified", "Cod TVA intracomunitar valid.", checkedAt),
      onrc.result,
    ],
    anaf,
    bilant,
    vies: { isValid: true, name: p.name, address: anaf.adresa, requestDate: today },
    onrc: onrc.data,
    checkedAt,
  };

  // Quiz answers: a well-informed administrator answers from the real figures; otherwise they are off by one bucket.
  const m = computeMetrics(uploads, company, today);
  const share = m.topClientSharePct;
  const shareBucket: QuizAnswers["topClientShare"] = share < 15 ? "<15" : share < 30 ? "15-30" : share < 50 ? "30-50" : ">50";
  const termBucket: QuizAnswers["paymentTerm"] = p.paymentTermDays <= 7 ? "0-7" : p.paymentTermDays <= 15 ? "15" : p.paymentTermDays <= 30 ? "30" : "45+";
  const quiz: QuizAnswers = p.quizAccurate
    ? {
        revenueEstimate: Math.round(m.revenueLast3Months / 10_000) * 10_000,
        paymentTerm: termBucket,
        topClientShare: shareBucket,
        mainSupplier: m.topSuppliers[0]?.name ?? null,
        hasSignificantCreditNotes: m.creditNotesSharePct3m > 5,
      }
    : {
        revenueEstimate: Math.round((m.revenueLast3Months * 1.45) / 10_000) * 10_000,
        paymentTerm: termBucket === "45+" ? "15" : "45+",
        topClientShare: shareBucket === ">50" ? "15-30" : ">50",
        mainSupplier: m.topSuppliers[m.topSuppliers.length - 1]?.name ?? null,
        hasSignificantCreditNotes: !(m.creditNotesSharePct3m > 5),
      };
  return { company, uploads, legal, official, quiz, investment: p.investment };
}

/** The original single demo company (NORD FRESH). */
export function buildDemo(today: string): DemoBundle {
  return buildDemoCompany(DEMO_PROFILES.nordfresh, today);
}

/** Every company of one plan scenario (Starter 1, Pro 3, Business 5), first one active. */
export function buildDemoPlan(tier: PlanTier, today: string): DemoBundle[] {
  return DEMO_PLAN_COMPANIES[tier].map((key) => buildDemoCompany(DEMO_PROFILES[key], today));
}
