import { tr } from "./i18n/tr.ts";
import { getNumberLocale } from "./util.ts";
/**
 * CrediFit — pricing, plan limits and feature gating. The ONE place to change a price or a limit.
 *
 * Pure module (no React / Next / I/O): used by the API routes, the provider and `node --test`.
 * Prices are in RON, VAT-exclusive; `yearly` is the monthly equivalent when billed annually (−20%).
 */

export type PlanTier = "starter" | "pro" | "business";
export type BillingCycle = "monthly" | "yearly";
export type SubscriptionStatus = "active" | "trialing" | "canceled";

export const PLAN_TIERS: PlanTier[] = ["starter", "pro", "business"];
export const BILLING_CYCLES: BillingCycle[] = ["monthly", "yearly"];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Romanian standard VAT rate (from 1 August 2025). */
export const VAT_RATE = 0.21;
/** Discount advertised on the yearly toggle. */
export const YEARLY_DISCOUNT_PCT = 20;
/** RON per EUR used by the ROI calculator (BNR reference, rounded). */
export const EUR_RON = 5.0;

/** Gated capabilities. `canPerformAction(plan, feature)` answers every check. */
export type Feature =
  | "multiCompany"
  | "unlimitedXmlUploads"
  | "portalJustCheck"
  | "multiSourceVerification"
  | "fullFormulaAudit"
  | "sectorBenchmark"
  | "allBankRecommendations"
  | "fullActionPlan"
  | "exportPdf"
  | "riskAlerts"
  | "spvSync"
  | "prioritySupport"
  | "whatIfSimulator"
  | "stressTest"
  | "portfolioDashboard";

export interface PlanLimits {
  /** Companies (SRL) kept in the profile. `null` = unlimited. */
  maxCompanies: number | null;
  /** e-Factura uploads per company. `null` = unlimited. */
  maxXmlUploads: number | null;
  /** Bank recommendations shown unblurred. `null` = all of them. */
  visibleBankRecommendations: number | null;
  /** Action-plan items shown unblurred. `null` = the full 30–90 day plan. */
  visibleActionItems: number | null;
  canSeeAllBanks: boolean;
  canExportPdf: boolean;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  subtitle: string;
  /** RON / month, VAT-exclusive. */
  price: { monthly: number; yearly: number };
  highlighted: boolean;
  badge?: string;
  cta: string;
  limits: PlanLimits;
  features: Record<Feature, boolean>;
  /** Marketing bullets for the plan card, in display order. */
  includes: { text: string; roadmap?: boolean }[];
}

const NONE: Record<Feature, boolean> = {
  multiCompany: false,
  unlimitedXmlUploads: false,
  portalJustCheck: false,
  multiSourceVerification: false,
  fullFormulaAudit: false,
  sectorBenchmark: false,
  allBankRecommendations: false,
  fullActionPlan: false,
  exportPdf: false,
  riskAlerts: false,
  spvSync: false,
  prioritySupport: false,
  whatIfSimulator: false,
  stressTest: false,
  portfolioDashboard: false,
};

const PRO_FEATURES: Record<Feature, boolean> = {
  ...NONE,
  multiCompany: true,
  unlimitedXmlUploads: true,
  portalJustCheck: true,
  multiSourceVerification: true,
  fullFormulaAudit: true,
  sectorBenchmark: true,
  allBankRecommendations: true,
  fullActionPlan: true,
  exportPdf: true,
  whatIfSimulator: true,
  stressTest: true,
};

export const PLANS: Record<PlanTier, PlanDefinition> = {
  starter: {
    tier: "starter",
    name: "Starter",
    subtitle: "Verifică rapid unde te afli înainte să vorbești cu banca.",
    price: { monthly: 0, yearly: 0 },
    highlighted: false,
    cta: "Începe Gratuit",
    limits: { maxCompanies: 1, maxXmlUploads: 3, visibleBankRecommendations: 1, visibleActionItems: 2, canSeeAllBanks: false, canExportPdf: false },
    features: NONE,
    includes: [
      { text: "1 firmă activă în profil" },
      { text: "Calcul Scor „Credit Ready” de bază (pilonii principali)" },
      { text: "Quiz de evaluare factor uman (5 întrebări)" },
      { text: "Upload până la 3 facturi e-Factura (testare live)" },
      { text: "Previzualizare (top 2 acțiuni) din planul de 30–90 zile" },
      { text: "1 recomandare bancară generală" },
    ],
  },
  pro: {
    tier: "pro",
    name: "Pro — Credit Ready",
    subtitle: "Pregătire completă de finanțare, la o fracțiune din costul unui consultant.",
    price: { monthly: 149, yearly: 119 },
    highlighted: true,
    badge: "Recomandat IMM",
    cta: "Activează Planul Pro",
    limits: { maxCompanies: 3, maxXmlUploads: null, visibleBankRecommendations: null, visibleActionItems: null, canSeeAllBanks: true, canExportPdf: true },
    features: PRO_FEATURES,
    includes: [
      { text: "Până la 3 firme (SRL-uri) gestionate simultan fără pierdere de date" },
      { text: "Upload nelimitat de facturi e-Factura (UBL 2.1) cu recalculare în timp real" },
      { text: "Verificare automată portal.just.ro (firmă + CEO/administrator) și alte 5 surse oficiale" },
      { text: "Audit complet al formulelor bancare (DSCR, DSO, stabilitate încasări, sezonalitate, concentrare)" },
      { text: "Comparație detaliată cu media sectorului (benchmark CAEN)" },
      { text: "Motor complet de recomandare bănci din România (BCR, BT, ING, Raiffeisen, CEC, UniCredit)" },
      { text: "Plan complet de acțiune pe 30–90 zile + Export Raport „Gata de Bancă” (Print/PDF)" },
    ],
  },
  business: {
    tier: "business",
    name: "Business & Contabili",
    subtitle: "Pentru firme în creștere, grupuri de firme și cabinete de contabilitate.",
    price: { monthly: 449, yearly: 359 },
    highlighted: false,
    cta: "Alege Business",
    limits: { maxCompanies: null, maxXmlUploads: null, visibleBankRecommendations: null, visibleActionItems: null, canSeeAllBanks: true, canExportPdf: true },
    features: { ...PRO_FEATURES, riskAlerts: true, spvSync: true, prioritySupport: true, portfolioDashboard: true },
    includes: [
      { text: "Firme (SRL-uri) nelimitate, cu selector rapid multi-company" },
      { text: "Dashboard consolidat al portofoliului (scor, DSCR, concentrare și alerte pentru fiecare firmă)" },
      { text: "Toate funcționalitățile din Planul Pro" },
      { text: "Alerte automate de risc (DSCR < 1,25, concentrare client > 40%, stornări > 5%)" },
      { text: "Sincronizare automată SPV / e-Factura & Open Banking", roadmap: true },
      { text: "Sesiune de onboarding și suport prioritar" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Pay-per-use: one complete analysis for ONE company, no subscription
// ---------------------------------------------------------------------------

/** Billing model of a company: a monthly / yearly plan, or a one-off pay-per-use unlock. */
export type BillingModel = PlanTier | "pay-per-use";

export const PAY_PER_USE = {
  id: "pay-per-use" as const,
  name: "Pay-Per-Use",
  subtitle: "Plată per utilizare — o analiză completă pentru o firmă, fără abonament recurent.",
  /** RON, VAT-exclusive, paid once per company. */
  price: 49,
  cta: "Deblochează analiza — 49 RON",
  includes: [
    "Plată unică de 49 RON / analiză completă (fără abonament)",
    "Toate cele 5 surse oficiale verificate (ANAF, bilanț, VIES, ONRC, portal.just.ro)",
    "Toate băncile din România (BCR, BT, ING, Raiffeisen, CEC, UniCredit)",
    "Simulator interactiv What-If și Stress Test de sezonalitate",
    "Export PDF „Fișă Pre-Calificare Bancă” (1 pagină A4)",
    "Plan complet de acțiune 30–90 de zile",
  ],
  /** Features unlocked for the company that bought the analysis. */
  features: {
    ...NONE,
    unlimitedXmlUploads: true,
    portalJustCheck: true,
    multiSourceVerification: true,
    fullFormulaAudit: true,
    sectorBenchmark: true,
    allBankRecommendations: true,
    fullActionPlan: true,
    exportPdf: true,
    whatIfSimulator: true,
    stressTest: true,
  } satisfies Record<Feature, boolean>,
} as const;

/** One pay-per-use invoice: 49 RON + VAT. */
export function payPerUseBreakdown() {
  const net = PAY_PER_USE.price;
  const vat = round2(net * VAT_RATE);
  return { net, vat, gross: round2(net + vat), vatRate: VAT_RATE, currency: "RON" as const };
}

/** B2B / white-label offer for banks (no list price: custom licence + per-lead commission). */
export const ENTERPRISE_OFFER = {
  title: "Pentru Bănci & Instituții Financiare (Enterprise / White-Label)",
  description:
    "Primiți dosare pre-calificate, cu risc redus și antreprenori educați financiar. Integrare API sau soluție White-Label direct în ecosistemul băncii.",
  monetization: [
    "Licență SaaS / White-Label personalizată",
    "Comision per lead calificat („Credit Ready” cu scor > 70 și DSCR validat)",
    "Reducere cu până la 60% a timpului de pre-analiză a dosarelor IMM",
  ],
  /** A lead is billable when the final score and DSCR clear these bars. */
  qualifiedLead: { minFinalScore: 70, minDscr: 1.25 },
  cta: "Solicită Demo B2B",
} as const;

/** Thresholds of the Business-plan automatic risk alerts. */
export const RISK_ALERT_THRESHOLDS = { minDscr: 1.25, maxTopClientSharePct: 40, maxCreditNotesPct: 5 } as const;

// ---------------------------------------------------------------------------
// Validation & lookups
// ---------------------------------------------------------------------------

export const isPlanTier = (v: unknown): v is PlanTier => typeof v === "string" && (PLAN_TIERS as string[]).includes(v);
export const isBillingCycle = (v: unknown): v is BillingCycle => typeof v === "string" && (BILLING_CYCLES as string[]).includes(v);

export const DEFAULT_PLAN: PlanTier = "starter";
export const DEFAULT_BILLING: BillingCycle = "monthly";

export const getPlan = (tier: PlanTier): PlanDefinition => PLANS[tier] ?? PLANS[DEFAULT_PLAN];

/** "Plan: PRO" style label for the header badge. */
export const planBadgeLabel = (tier: PlanTier) => `Plan: ${tier.toUpperCase()}`;

// ---------------------------------------------------------------------------
// Feature gating
// ---------------------------------------------------------------------------

/** `payPerUse` = the active company bought a one-off complete analysis (unlocks it on any plan). */
export function canPerformAction(tier: PlanTier, feature: Feature, payPerUse = false): boolean {
  return getPlan(tier).features[feature] === true || (payPerUse && PAY_PER_USE.features[feature] === true);
}

/** Visible-list limits with the pay-per-use unlock applied (all banks, full plan). */
export const effectiveLimit = (limit: number | null, payPerUse: boolean) => (payPerUse ? null : limit);

/** Lowest plan that unlocks a feature (for "Deblochează cu Planul …" prompts). */
export function requiredPlanFor(feature: Feature): PlanTier {
  return PLAN_TIERS.find((t) => PLANS[t].features[feature]) ?? "business";
}

const withinLimit = (limit: number | null, used: number) => limit === null || used < limit;

/** Can one more XML invoice be uploaded for this company? `usedUploads` = XML invoices already uploaded. */
export function canUploadXml(tier: PlanTier, usedUploads: number, payPerUse = false) {
  const limit = effectiveLimit(getPlan(tier).limits.maxXmlUploads, payPerUse);
  return { allowed: withinLimit(limit, usedUploads), limit, remaining: limit === null ? null : Math.max(0, limit - usedUploads) };
}

/** How many of `files` fit under the plan's XML limit; the rest needs an upgrade. */
export function splitUploadsByLimit<T>(tier: PlanTier, usedUploads: number, files: T[], payPerUse = false) {
  const { remaining } = canUploadXml(tier, usedUploads, payPerUse);
  if (remaining === null) return { accepted: files, rejected: [] as T[] };
  return { accepted: files.slice(0, remaining), rejected: files.slice(remaining) };
}

/** Can one more company be added to the profile? `companyCount` = companies already in it. */
export function canAddCompany(tier: PlanTier, companyCount: number) {
  const limit = getPlan(tier).limits.maxCompanies;
  return { allowed: withinLimit(limit, companyCount), limit };
}

/** Items visible unblurred vs. locked behind an upgrade (bank recommendations, action plan). */
export function gateList<T>(items: T[], visible: number | null) {
  if (visible === null) return { visible: items, locked: [] as T[] };
  return { visible: items.slice(0, visible), locked: items.slice(visible) };
}

export const gateBanks = <T>(tier: PlanTier, banks: T[], payPerUse = false) => gateList(banks, effectiveLimit(getPlan(tier).limits.visibleBankRecommendations, payPerUse));
export const gateActionPlan = <T>(tier: PlanTier, items: T[], payPerUse = false) => gateList(items, effectiveLimit(getPlan(tier).limits.visibleActionItems, payPerUse));

/** Business-plan risk alerts from the current indicators. Empty when the plan has no alerts. */
export function riskAlerts(tier: PlanTier, m: { dscr: number; topClientSharePct: number; creditNotesSharePct: number }): string[] {
  if (!canPerformAction(tier, "riskAlerts")) return [];
  const t = RISK_ALERT_THRESHOLDS;
  const alerts: string[] = [];
  if (m.dscr < t.minDscr) alerts.push(tr("DSCR {a}× a scăzut sub {b}×.", { a: m.dscr.toLocaleString(getNumberLocale()), b: t.minDscr.toLocaleString(getNumberLocale()) }));
  if (m.topClientSharePct > t.maxTopClientSharePct)
    alerts.push(tr("Concentrarea pe clientul principal ({a}%) depășește {b}%.", { a: m.topClientSharePct.toLocaleString(getNumberLocale()), b: t.maxTopClientSharePct }));
  if (m.creditNotesSharePct > t.maxCreditNotesPct)
    alerts.push(tr("Stornările ({a}%) depășesc {b}% din facturile emise.", { a: m.creditNotesSharePct.toLocaleString(getNumberLocale()), b: t.maxCreditNotesPct }));
  return alerts;
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

/** Monthly price shown on the card for the chosen billing cycle (RON, VAT-exclusive). */
export const monthlyPrice = (tier: PlanTier, cycle: BillingCycle) => getPlan(tier).price[cycle];

/** What one invoice costs: a month (monthly) or 12 months up front (yearly). */
export function priceBreakdown(tier: PlanTier, cycle: BillingCycle) {
  const perMonth = monthlyPrice(tier, cycle);
  const months = cycle === "yearly" ? 12 : 1;
  const net = round2(perMonth * months);
  const vat = round2(net * VAT_RATE);
  return { perMonth, months, net, vat, gross: round2(net + vat), vatRate: VAT_RATE, currency: "RON" as const };
}

/** RON saved per year by paying yearly instead of monthly. */
export function yearlySavings(tier: PlanTier) {
  const p = getPlan(tier).price;
  return (p.monthly - p.yearly) * 12;
}

export const formatRon = (n: number) => `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(n)} RON`;

// ---------------------------------------------------------------------------
// ROI vs. traditional consultancy
// ---------------------------------------------------------------------------

/** Market reference prices for SME credit-file consultancy in Romania. */
export const CONSULTING_BENCHMARK = {
  /** One credit file prepared by a consultant: 500–1.500 EUR. */
  filePrepEur: { min: 500, max: 1500 },
  /** Hourly rate for updates after new invoices: 250–800 RON. */
  hourlyRon: { min: 250, max: 800 },
  diagnosticTime: "1 – 2 săptămâni",
} as const;

export const ROI_COMPARISON = [
  { label: "Cost pregătire dosar credit IMM", traditional: "500 – 1.500 EUR (2.500 – 7.500 RON)", creditReady: "149 RON / lună (economie de peste 90%)" },
  { label: "Timp de diagnostic", traditional: CONSULTING_BENCHMARK.diagnosticTime, creditReady: "Sub 2 minute (instant pe e-Factura)" },
  { label: "Actualizare la facturi noi", traditional: "Taxată separat (250–800 RON/oră)", creditReady: "Recalculare automată în timp real la upload XML" },
  { label: "Potrivire bănci România", traditional: "Subiectivă / limitată", creditReady: "Algoritm obiectiv pe 6 bănci din România" },
  { label: "O singură analiză, fără abonament", traditional: "Minimum 500 EUR / dosar", creditReady: "Pay-Per-Use: 49 RON / analiză completă" },
] as const;

export interface RoiInput {
  /** Credit files prepared per year. */
  filesPerYear: number;
  /** Extra consultancy hours per year (updates after new invoices, bank questions). */
  hoursPerYear: number;
  tier?: PlanTier;
  cycle?: BillingCycle;
}

/**
 * Yearly saving vs. a consultant, using the midpoint of the market ranges
 * (1.000 EUR per file, 525 RON per hour). Never negative.
 */
export function computeRoi({ filesPerYear, hoursPerYear, tier = "pro", cycle = "yearly" }: RoiInput) {
  const files = Math.max(0, filesPerYear);
  const hours = Math.max(0, hoursPerYear);
  const fileEur = (CONSULTING_BENCHMARK.filePrepEur.min + CONSULTING_BENCHMARK.filePrepEur.max) / 2;
  const hourRon = (CONSULTING_BENCHMARK.hourlyRon.min + CONSULTING_BENCHMARK.hourlyRon.max) / 2;
  const consultingRon = files * fileEur * EUR_RON + hours * hourRon;
  const platformRon = monthlyPrice(tier, cycle) * 12;
  const savingsRon = Math.max(0, consultingRon - platformRon);
  return {
    consultingRon: Math.round(consultingRon),
    platformRon,
    savingsRon: Math.round(savingsRon),
    savingsEur: Math.round(savingsRon / EUR_RON),
    savingsPct: consultingRon > 0 ? Math.round((savingsRon / consultingRon) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Feature matrix & FAQ (content for the /pricing page)
// ---------------------------------------------------------------------------

/** `true` / `false` = ✓ / ✗, a string = an exact limit. Columns: starter, pro, business, enterprise. */
export type MatrixCell = boolean | string;

export const FEATURE_MATRIX: { category: string; rows: { label: string; cells: [MatrixCell, MatrixCell, MatrixCell, MatrixCell] }[] }[] = [
  {
    category: "Analiză e-Factura & Scoring",
    rows: [
      { label: "Scor Credit Ready (S_Business, S_Uman, S_Investiție)", cells: [true, true, true, true] },
      { label: "Upload facturi e-Factura (UBL 2.1)", cells: ["max. 3", "nelimitat", "nelimitat", "API"] },
      { label: "Audit formule bancare (DSCR, DSO, sezonalitate, concentrare)", cells: ["piloni de bază", true, true, true] },
      { label: "Benchmark sector CAEN", cells: [false, true, true, true] },
    ],
  },
  {
    category: "Factor Uman & Legal",
    rows: [
      { label: "Quiz factor uman (5 întrebări)", cells: [true, true, true, true] },
      { label: "Verificare portal.just.ro (firmă + administrator)", cells: [false, true, true, true] },
      { label: "Verificare multi-sursă (ANAF, ONRC, BPI, Ghișeul.ro, CIP/RNPM)", cells: [false, true, true, true] },
      { label: "Alerte automate de risc", cells: [false, false, true, true] },
    ],
  },
  {
    category: "Recomandare Bănci & Plan 90 Zile",
    rows: [
      { label: "Recomandări bancare (6 bănci din România)", cells: ["1 generală", "toate", "toate", "white-label"] },
      { label: "Simulator What-If & Stress Test sezonalitate", cells: [false, true, true, true] },
      { label: "Plan de acțiune 30–90 zile", cells: ["top 2 acțiuni", "complet", "complet", "complet"] },
      { label: "Export Raport „Gata de Bancă” (Print/PDF)", cells: [false, true, true, true] },
      { label: "Leaduri pre-calificate (scor > 70, DSCR validat)", cells: [false, false, false, true] },
    ],
  },
  {
    category: "Multi-Firmă & Suport",
    rows: [
      { label: "Firme (SRL-uri) în profil", cells: ["1", "până la 3", "nelimitat", "nelimitat"] },
      { label: "Sincronizare SPV / Open Banking", cells: [false, false, "roadmap", "roadmap"] },
      { label: "Onboarding & suport prioritar", cells: [false, false, true, "dedicat"] },
      { label: "Integrare API / White-Label", cells: [false, false, false, true] },
    ],
  },
];

export const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: "Este acest scor o aprobare garantată de la bancă?",
    a: "Nu. Scorul Credit Ready este un indicator de pregătire (credit readiness), calculat pe datele tale e-Factura și pe surse publice. Decizia de creditare aparține exclusiv băncii, după propria analiză de risc și documentele solicitate.",
  },
  {
    q: "Cum îmi protejați datele din e-Factura?",
    a: "Facturile sunt procesate doar pentru firma activă și stocate criptat în Supabase (Postgres, centre de date UE). Nu vindem și nu partajăm datele; cu o bancă parteneră se trimite un dosar numai cu acordul tău explicit.",
  },
  {
    q: "Pot anula abonamentul oricând după ce obțin finanțarea?",
    a: "Da. Abonamentul lunar se oprește la finalul lunii curente, fără penalități. La planul anual, accesul rămâne activ până la finalul perioadei plătite.",
  },
  {
    q: "Cum funcționează planul Business pentru firme de contabilitate?",
    a: "Planul Business permite un număr nelimitat de firme în același cont, cu selector rapid între ele. Fiecare firmă are propriile facturi, scoruri și verificări, iar alertele de risc semnalează automat clienții care au nevoie de atenție.",
  },
  {
    q: "De ce costă mult mai puțin decât un consultant financiar clasic?",
    a: "Diagnosticul care durează 1–2 săptămâni la un consultant este calculat automat din e-Factura în sub 2 minute, iar actualizarea la facturi noi nu se mai plătește la oră. Plătești doar abonamentul, nu timpul de analiză manuală.",
  },
];
