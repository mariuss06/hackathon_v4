/**
 * Romanian bank & financing-package matcher.
 *
 * Takes the computed Credit Ready profile of the active SRL and ranks a catalogue of SME
 * products offered in Romania (BCR, Banca Transilvania, ING, Raiffeisen, CEC, UniCredit).
 * Eligibility rules are based on PUBLIC market criteria (minimum DSCR covenants, own
 * contribution, purpose of the financing) and are orientative: this is not an offer.
 *
 * Match % = weighted fit of: ScorFinal, DSCR at the product's terms, purpose, own contribution,
 * requested amount / annualized revenue, plus product-specific signals (DSO, client concentration,
 * seasonality, volatility, size), then multiplied by a portal.just.ro factor.
 *
 * Pure module: type-only imports + bcr-formulas + util.
 */
import type { InvestmentPurpose, SectorBenchmark } from "../types/scoring";
import { annuityInstallment, CREDIT_READY_MIN_SCORE, principalForInstallment } from "./bcr-formulas.ts";
import { clamp, num, pct, ron } from "./util.ts";
import { tr } from "./i18n/tr.ts";

/** When the catalogue values were last checked against public bank offers. */
export const BANK_DATA_AS_OF = "2025–2026";

export const BANK_DISCLAIMER =
  tr("Dobânzile, maturitățile și aporturile afișate sunt valori orientative din piața bancară din România (2025–2026), calculate pe baza ofertelor publice; costul final depinde de ROBOR/IRCC la data acordării și de analiza băncii. Recomandările bancare sunt orientative, bazate pe criterii publice de eligibilitate din piața bancară din România și pe datele analizate. Aceasta nu reprezintă o ofertă fermă sau o aprobare de credit.");

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface BankMatchInput {
  finalScore: number;
  /** Monthly EBITDA estimate (operating cash flow before debt service), RON. */
  operatingCashFlow: number;
  /** Existing loans / leasing installments per month, RON. */
  existingMonthlyDebtService: number;
  purpose: InvestmentPurpose | null;
  ownContributionPct: number | null;
  requestedAmount: number | null;
  annualizedRevenue: number;
  dsoDays: number;
  topClientSharePct: number;
  revenueCv: number;
  seasonalityRatio: number;
  /** Off-season resilience ratio from S_Business (weak-month margin / obligations). */
  resilienceRatio: number;
  sector: SectorBenchmark;
  legalScore: number;
  legalCritical: boolean;
  legalPending: boolean;
}

export type ProductKind = "investitie" | "capital_lucru" | "factoring" | "microcredit" | "garantat" | "leasing";

export interface BankRecommendation {
  id: string;
  bank: string;
  product: string;
  kind: ProductKind;
  kindLabel: string;
  idealFor: string;
  /** 0-100. */
  matchPct: number;
  /** All hard minimums (score, DSCR, own contribution) are met. */
  eligible: boolean;
  /** Orientative maximum eligible amount, RON (rounded to 10.000). */
  maxAmount: number;
  maxAmountBasis: string;
  maturityLabel: string;
  rateLabel: string;
  /** Indicative yearly rate range (%), e.g. [8.5, 10.5]. */
  rateRangePct: [number, number];
  /** Minimum own contribution (%) and how the bank phrases it. */
  minOwnPct: number;
  minOwnLabel: string;
  /** Minimum DSCR covenant (0 = not applicable). */
  minDscr: number;
  /** DSCR recomputed with the requested amount at this product's terms (null for factoring). */
  dscrAtProduct: number | null;
  /** Monthly cost of the requested amount at this product's terms (installment or interest), RON. */
  monthlyCost: number;
  /** Why it fits: 2-3 arguments built from the firm's real numbers. */
  reasons: string[];
  /** What to fix before applying. */
  conditions: string[];
}

export interface BankMatchResult {
  top: BankRecommendation;
  alternatives: BankRecommendation[];
  all: BankRecommendation[];
  creditReady: boolean;
  readinessNote: string;
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

type Repayment = "anuitate" | "dobanda" | "factoring";

interface Criterion {
  weight: number;
  /** 0-1. */
  fit: number;
  pro: string;
  con: string;
}

interface Product {
  id: string;
  bank: string;
  product: string;
  kind: ProductKind;
  idealFor: string;
  minScore: number;
  /** Minimum DSCR covenant at the product's terms (0 = not applicable, e.g. factoring). */
  minDscr: number;
  minOwnPct: number;
  purposeFit: Record<InvestmentPurpose, number>;
  rateRangePct: [number, number];
  maturityMonths: [number, number];
  maturityLabel?: string;
  rateLabel?: string;
  ownLabel?: string;
  repayment: Repayment;
  /** Max amount as a share of annualized revenue. */
  maxRevenueShare: number;
  /** Orientative absolute cap, RON. */
  maxAbsolute: number;
  /** Product-specific signals. */
  signals: (x: BankMatchInput) => Criterion[];
}

const KIND_LABEL: Record<ProductKind, string> = {
  investitie: tr("Credit de investiții"),
  capital_lucru: tr("Capital de lucru / linie de credit"),
  factoring: "Factoring / scontare",
  microcredit: "Microcredit",
  garantat: tr("Credit cu garanție de stat"),
  leasing: "Leasing / credit echipamente",
};

const PURPOSE_LABEL: Record<InvestmentPurpose, string> = {
  growth: tr("creștere / utilaje / tehnologie"),
  working_capital: tr("capital de lucru"),
  marketing: tr("marketing și digitalizare"),
  refinancing: tr("refinanțare / lichiditate"),
};

const stabilitySignal = (x: BankMatchInput, weight: number, maxCv: number): Criterion => ({
  weight,
  fit: x.revenueCv <= maxCv ? 1 : x.revenueCv <= maxCv + 0.15 ? 0.5 : 0.15,
  pro: tr("Încasări stabile: volatilitate lunară (CV) {a}, sub pragul de {b} urmărit de bancă.", { a: num(x.revenueCv), b: num(maxCv) }),
  con: tr("Volatilitatea veniturilor (CV {a}) depășește {b}: netezește încasările (contracte-cadru, abonamente) înainte de aplicare.", { a: num(x.revenueCv), b: num(maxCv) }),
});

export const BANK_PRODUCTS: Product[] = [
  {
    id: "bcr-investitii",
    bank: "BCR",
    product: tr("Credit de Investiții IMM / George pentru Afaceri"),
    kind: "investitie",
    idealFor: tr("Creștere, utilaje și echipamente, cu aport propriu de minimum 15% și DSCR ≥ 1,25."),
    minScore: 68,
    minDscr: 1.25,
    minOwnPct: 15,
    purposeFit: { growth: 1, marketing: 0.55, working_capital: 0.2, refinancing: 0.1 },
    rateRangePct: [8.5, 10.5],
    rateLabel: "ROBOR 3M/6M + 2,5–4,2 pp (~8,5–10,5%/an)",
    ownLabel: "15–20%",
    maturityMonths: [12, 84],
    repayment: "anuitate",
    maxRevenueShare: 0.5,
    maxAbsolute: 5_000_000,
    signals: (x) => [stabilitySignal(x, 10, 0.3)],
  },
  {
    id: "bcr-capital-lucru",
    bank: "BCR",
    product: tr("Linie de Credit / Capital de Lucru BCR"),
    kind: "capital_lucru",
    idealFor: tr("Stocuri sezoniere și decalaje de încasare (DSO peste 30 de zile)."),
    minScore: 60,
    minDscr: 1.2,
    minOwnPct: 0,
    purposeFit: { working_capital: 1, refinancing: 0.4, marketing: 0.3, growth: 0.2 },
    rateRangePct: [8.5, 10.5],
    rateLabel: "ROBOR 3M/6M + 2,5–4,2 pp (~8,5–10,5%/an)",
    maturityMonths: [12, 36],
    maturityLabel: tr("12–36 luni (revolving, reînnoibilă)"),
    repayment: "dobanda",
    maxRevenueShare: 0.25,
    maxAbsolute: 3_000_000,
    signals: (x) => [
      {
        weight: 15,
        fit: x.dsoDays > 30 ? 1 : x.dsoDays > 20 ? 0.55 : 0.2,
        pro: tr("Decalaj real de încasare: DSO {a} zile — linia acoperă golul dintre plata furnizorilor și încasarea clienților.", { a: num(x.dsoDays) }),
        con: tr("DSO de doar {a} zile: nevoia de capital de lucru e mică; justifică linia prin stocuri sau contracte noi.", { a: num(x.dsoDays) }),
      },
      {
        weight: 10,
        fit: x.seasonalityRatio >= 1.4 ? 1 : 0.5,
        pro: tr("Vânzările variază de {a}× între luna de vârf și cea mai slabă: linia finanțează stocurile de sezon.", { a: num(x.seasonalityRatio) }),
        con: tr("Sezonalitate redusă ({a}×): argumentează nevoia de lichiditate cu un buget de stocuri.", { a: num(x.seasonalityRatio) }),
      },
    ],
  },
  {
    id: "bcr-factoring",
    bank: "BCR",
    product: "Factoring / Scontare Facturi BCR",
    kind: "factoring",
    idealFor: tr("Clienți mari, solvabili, cu termene de plată lungi (DSO ≥ 45 de zile)."),
    minScore: 50,
    minDscr: 0,
    minOwnPct: 0,
    purposeFit: { working_capital: 1, refinancing: 0.45, marketing: 0.2, growth: 0.15 },
    rateRangePct: [8.5, 10.5],
    maturityMonths: [1, 4],
    maturityLabel: tr("30–120 de zile pe factură, revolving"),
    rateLabel: tr("~8,5–10,5%/an + comision de factoring"),
    repayment: "factoring",
    maxRevenueShare: 0.3,
    maxAbsolute: 4_000_000,
    signals: (x) => [
      {
        weight: 30,
        fit: x.dsoDays >= 45 ? 1 : x.dsoDays >= 30 ? 0.5 : 0.1,
        pro: tr("Termen mediu de încasare {a} zile: facturile pot fi transformate în bani imediat (avans de ~80%).", { a: num(x.dsoDays) }),
        con: tr("DSO {a} zile, sub pragul de 45 de zile de la care factoringul devine rentabil.", { a: num(x.dsoDays) }),
      },
      {
        weight: 15,
        fit: x.topClientSharePct >= 30 ? 1 : x.topClientSharePct >= 20 ? 0.65 : 0.3,
        pro: tr("Clientul #1 generează {a} din vânzări: riscul se mută pe un debitor mare, analizat separat de bancă.", { a: pct(x.topClientSharePct) }),
        con: tr("Clienții sunt fragmentați (clientul #1 {a}): factoringul pe mulți debitori mici e mai scump.", { a: pct(x.topClientSharePct) }),
      },
    ],
  },
  {
    id: "bt-mic",
    bank: "Banca Transilvania",
    product: tr("BT Mic — credit pentru afaceri mici (până la 200.000 RON)"),
    kind: "microcredit",
    idealFor: tr("Firme mici, scor mediu (50–70), nevoie rapidă de capital de lucru sau echipamente, fără garanții imobiliare grele."),
    minScore: 50,
    minDscr: 1.15,
    minOwnPct: 0,
    purposeFit: { working_capital: 1, growth: 0.9, marketing: 0.8, refinancing: 0.3 },
    rateRangePct: [11, 13.5],
    rateLabel: tr("~11–13,5%/an, fără garanții imobiliare"),
    maturityMonths: [12, 60],
    repayment: "anuitate",
    maxRevenueShare: 0.3,
    maxAbsolute: 200_000,
    signals: (x) => [
      {
        weight: 15,
        fit: x.annualizedRevenue <= 5_000_000 ? 1 : x.annualizedRevenue <= 10_000_000 ? 0.55 : 0.2,
        pro: tr("Cifră de afaceri anualizată de {a}: profil de firmă mică, potrivit microfinanțării rapide.", { a: ron(x.annualizedRevenue) }),
        con: tr("CA anualizată de {a} depășește profilul tipic de microcredit: un credit IMM standard e mai avantajos.", { a: ron(x.annualizedRevenue) }),
      },
      {
        weight: 10,
        fit: x.finalScore >= 50 && x.finalScore <= 72 ? 1 : x.finalScore > 72 ? 0.5 : 0.3,
        pro: tr("Scorul {a} se încadrează în banda 50–70 vizată de microfinanțare, fără garanții imobiliare grele.", { a: num(x.finalScore) }),
        con: tr("Cu scorul {a} firma se califică probabil pentru produse IMM standard, cu sume mai mari.", { a: num(x.finalScore) }),
      },
    ],
  },
  {
    id: "bt-investitii",
    bank: "Banca Transilvania",
    product: tr("Credit IMM Investiții BT (până la 2.500.000 RON)"),
    kind: "investitie",
    idealFor: tr("Firme cu istoric solid (scor ≥ 65, DSCR ≥ 1,2) care finanțează investiții sau capital de lucru."),
    minScore: 65,
    minDscr: 1.2,
    minOwnPct: 10,
    purposeFit: { growth: 1, working_capital: 0.8, marketing: 0.6, refinancing: 0.3 },
    rateRangePct: [8.8, 10.8],
    rateLabel: "~8,8–10,8%/an",
    maturityMonths: [12, 84],
    repayment: "anuitate",
    maxRevenueShare: 0.5,
    maxAbsolute: 2_500_000,
    signals: (x) => [stabilitySignal(x, 10, 0.3)],
  },
  {
    id: "ing-afaceri",
    bank: "ING Bank România",
    product: tr("Credit Afaceri / Linie de Credit ING (până la 1.500.000 RON)"),
    kind: "capital_lucru",
    idealFor: tr("Fluxuri digitale curate, volatilitate scăzută și clienți diversificați (client #1 sub 40%), scor ≥ 70."),
    minScore: 70,
    minDscr: 1.25,
    minOwnPct: 0,
    purposeFit: { working_capital: 1, growth: 0.8, marketing: 0.65, refinancing: 0.4 },
    rateRangePct: [8.8, 10.5],
    rateLabel: "ROBOR 3M + 2,8–4,5 pp (~8,8–10,5%/an)",
    maturityMonths: [12, 60],
    repayment: "anuitate",
    maxRevenueShare: 0.3,
    maxAbsolute: 1_500_000,
    signals: (x) => [
      stabilitySignal(x, 12, 0.25),
      {
        weight: 13,
        fit: x.topClientSharePct < 40 ? 1 : x.topClientSharePct < 50 ? 0.4 : 0.1,
        pro: tr("Portofoliu diversificat: clientul #1 are {a} din vânzări (prag ING: sub 40%).", { a: pct(x.topClientSharePct) }),
        con: tr("Clientul #1 are {a} din vânzări, peste pragul de 40%: diversifică portofoliul înainte de aplicare.", { a: pct(x.topClientSharePct) }),
      },
    ],
  },
  {
    id: "raiffeisen-investitii",
    bank: "Raiffeisen Bank România",
    product: tr("Credit de Investiții / Capital de Lucru IMM"),
    kind: "investitie",
    idealFor: tr("Extindere sau tehnologie, cu aport propriu solid (≥ 20%) și scor ≥ 68."),
    minScore: 68,
    minDscr: 1.25,
    minOwnPct: 20,
    purposeFit: { growth: 1, marketing: 0.7, working_capital: 0.6, refinancing: 0.2 },
    rateRangePct: [8.5, 10.5],
    rateLabel: "~8,5–10,5%/an",
    maturityMonths: [12, 84],
    repayment: "anuitate",
    maxRevenueShare: 0.5,
    maxAbsolute: 5_000_000,
    signals: (x) => [
      {
        weight: 10,
        fit: (x.ownContributionPct ?? 0) >= 25 ? 1 : (x.ownContributionPct ?? 0) >= 20 ? 0.8 : 0.3,
        pro: tr("Aport propriu de {a}: implicarea acționarilor reduce riscul băncii și poate scădea marja.", { a: pct(x.ownContributionPct ?? 0) }),
        con: tr("Raiffeisen cere un aport solid (≥ 20%); acum ai {a}.", { a: pct(x.ownContributionPct ?? 0) }),
      },
    ],
  },
  {
    id: "cec-garantii",
    bank: "CEC Bank",
    product: tr("Credit IMM cu garanții de stat (FNGCIMM, ex. IMM Invest Plus / scheme active) & Capital de Lucru"),
    kind: "garantat",
    idealFor: tr("Firme sezoniere (HoReCa, agricultură, producție) sau cu aport propriu mai mic (10–15%), scor ≥ 55."),
    minScore: 55,
    minDscr: 1.1,
    minOwnPct: 10,
    purposeFit: { working_capital: 1, growth: 0.9, refinancing: 0.55, marketing: 0.5 },
    rateRangePct: [8.2, 10],
    rateLabel: "~8,2–10,0%/an",
    ownLabel: "10–15%",
    maturityMonths: [12, 84],
    maturityLabel: tr("până la 72–84 luni"),
    repayment: "anuitate",
    maxRevenueShare: 0.5,
    maxAbsolute: 5_000_000,
    signals: (x) => [
      {
        weight: 15,
        fit: x.sector.seasonal ? 1 : x.seasonalityRatio >= 1.5 ? 0.75 : 0.3,
        pro: x.sector.seasonal
          ? tr("Sector sezonier ({a}): schemele cu garanție de stat acceptă cash-flow-ul neuniform din extrasezon.", { a: tr(x.sector.shortLabel) })
          : tr("Sezonalitate pronunțată ({a}× vârf/minim): garanția de stat compensează lunile slabe.", { a: num(x.seasonalityRatio) }),
        con: tr("Firma nu e sezonieră ({a}, {b}×): avantajul garanției de stat contează mai puțin.", { a: tr(x.sector.shortLabel), b: num(x.seasonalityRatio) }),
      },
      {
        weight: 10,
        fit: (x.ownContributionPct ?? 0) >= 10 && (x.ownContributionPct ?? 0) < 20 ? 1 : (x.ownContributionPct ?? 0) >= 20 ? 0.7 : 0.4,
        pro: tr("Aportul propriu de {a} e suficient: garanția FNGCIMM acoperă până la 80–90% din credit.", { a: pct(x.ownContributionPct ?? 0) }),
        con: tr("Aportul de {a} e sub minimul de 10% cerut și în schemele garantate.", { a: pct(x.ownContributionPct ?? 0) }),
      },
    ],
  },
  {
    id: "unicredit-leasing",
    bank: "UniCredit Bank România",
    product: tr("Credit de Investiții / Leasing Echipamente & Auto"),
    kind: "leasing",
    idealFor: tr("Achiziția de utilaje, echipamente sau flotă — bunul finanțat este chiar garanția."),
    minScore: 62,
    minDscr: 1.2,
    minOwnPct: 15,
    purposeFit: { growth: 1, marketing: 0.25, working_capital: 0.1, refinancing: 0.1 },
    rateRangePct: [8.5, 10.2],
    rateLabel: "~8,5–10,2%/an",
    ownLabel: "avans leasing 15–20%",
    maturityMonths: [24, 60],
    repayment: "anuitate",
    maxRevenueShare: 0.6,
    maxAbsolute: 4_000_000,
    signals: (x) => [
      {
        weight: 15,
        fit: x.purpose === "growth" ? 1 : 0.15,
        pro: tr("Destinația este echipamente / utilaje: bunul finanțat servește drept garanție, fără ipotecă imobiliară."),
        con: tr("Leasingul se potrivește doar achiziției de echipamente, utilaje sau autovehicule."),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const round10k = (n: number) => Math.max(0, Math.floor(n / 10_000) * 10_000);

/** Monthly cost of `amount` at the product's terms: annuity, interest only (revolving line) or 0 (factoring). */
function monthlyCost(p: Product, amount: number) {
  const rate = (p.rateRangePct[0] + p.rateRangePct[1]) / 200;
  if (amount <= 0 || p.repayment === "factoring") return 0;
  if (p.repayment === "dobanda") return (amount * rate) / 12;
  return annuityInstallment(amount, rate, p.maturityMonths[1]);
}

function maxEligibleAmount(p: Product, x: BankMatchInput) {
  const revenueCap = x.annualizedRevenue * p.maxRevenueShare;
  if (p.repayment === "factoring") {
    // Receivables portfolio ≈ annual revenue × DSO / 365; the factor advances ~80% of it.
    const receivables = (x.annualizedRevenue * x.dsoDays) / 365;
    const amount = Math.min(receivables * 0.8, p.maxAbsolute);
    return { amount: round10k(amount), basis: tr("~80% din creanțele curente ({a} = CA × DSO / 365)", { a: ron(receivables) }) };
  }
  const rate = (p.rateRangePct[0] + p.rateRangePct[1]) / 200;
  const covenant = Math.max(p.minDscr, 1.2);
  const freeInstallment = Math.max(0, x.operatingCashFlow / covenant - x.existingMonthlyDebtService);
  const byDscr =
    p.repayment === "dobanda" ? (freeInstallment * 12) / rate : principalForInstallment(freeInstallment, rate, p.maturityMonths[1]);
  const amount = Math.min(byDscr, revenueCap, p.maxAbsolute);
  const binding = amount === byDscr ? tr("capacitatea de plată la DSCR {a}×", { a: num(covenant) }) : amount === revenueCap ? tr("{a}% din CA anualizată", { a: Math.round(p.maxRevenueShare * 100) }) : "plafonul orientativ al produsului";
  return { amount: round10k(amount), basis: tr("limitat de {a}", { a: binding }) };
}

/**
 * Comfort above a minimum: 1 when value ≥ min + span (comfortable margin), 0.6 exactly at the
 * minimum (eligible but tight), linearly down to 0 at min − span (clearly below the bar).
 */
function thresholdFit(value: number, min: number, span: number) {
  if (value >= min + span) return 1;
  if (value >= min) return 0.6 + (0.4 * (value - min)) / span;
  return Math.max(0, 0.6 * (1 - (min - value) / span));
}

function evaluateProduct(p: Product, x: BankMatchInput): BankRecommendation {
  const requested = x.requestedAmount ?? 0;
  const cost = monthlyCost(p, requested);
  const debt = x.existingMonthlyDebtService + cost;
  const dscrAtProduct = p.repayment === "factoring" ? null : debt > 0 ? x.operatingCashFlow / debt : 99;
  const own = x.ownContributionPct ?? 0;
  const leverage = x.annualizedRevenue > 0 ? requested / x.annualizedRevenue : Infinity;
  const { amount: maxAmount, basis } = maxEligibleAmount(p, x);

  const criteria: Criterion[] = [
    {
      weight: 30,
      fit: thresholdFit(x.finalScore, p.minScore, 15),
      pro: tr("ScorFinal {a}, confortabil peste pragul orientativ al produsului ({b}).", { a: num(x.finalScore), b: p.minScore }),
      con:
        x.finalScore >= p.minScore
          ? tr("ScorFinal {a}, doar puțin peste pragul orientativ de {b}: încă {c} puncte din planul de 30–90 de zile ar da o marjă confortabilă.", { a: num(x.finalScore), b: p.minScore, c: num(p.minScore + 15 - x.finalScore) })
          : tr("ScorFinal {a} sub pragul orientativ de {b}: urmează planul de 30–90 de zile pentru a câștiga {c} puncte.", { a: num(x.finalScore), b: p.minScore, c: num(p.minScore - x.finalScore) }),
    },
  ];
  if (p.minDscr > 0 && dscrAtProduct !== null) {
    const tight = dscrAtProduct >= p.minDscr;
    criteria.push({
      weight: 20,
      fit: thresholdFit(dscrAtProduct, p.minDscr, 0.35),
      pro: requested > 0 ? tr("DSCR {a}× cu rata estimată de {b}/lună (minim cerut {c}×).", { a: num(dscrAtProduct), b: ron(cost), c: num(p.minDscr) }) : tr("DSCR actual {a}× (minim cerut {b}×).", { a: num(dscrAtProduct), b: num(p.minDscr) }),
      con: tight
        ? tr("DSCR {a}× la limita covenant-ului de {b}×: orice scădere a marjei îl împinge sub prag — prelungește maturitatea sau redu suma.", { a: num(dscrAtProduct), b: num(p.minDscr) })
        : requested > 0
          ? tr("DSCR {a}× la suma cerută, sub covenant-ul de {b}×: redu suma la max. {c} sau prelungește maturitatea.", { a: num(dscrAtProduct), b: num(p.minDscr), c: ron(maxAmount) })
          : tr("DSCR {a}× sub covenant-ul de {b}×: crește marja operațională sau redu ratele existente.", { a: num(dscrAtProduct), b: num(p.minDscr) }),
    });
  }
  criteria.push({
    weight: 20,
    fit: x.purpose ? p.purposeFit[x.purpose] : 0.5,
    pro: x.purpose ? tr("Destinația declarată ({a}) corespunde exact acestui tip de produs.", { a: tr(PURPOSE_LABEL[x.purpose]) }) : tr("Destinația nu este încă declarată."),
    con: x.purpose ? tr("Destinația „{a}” nu este specifică pentru {b}.", { a: tr(PURPOSE_LABEL[x.purpose]), b: tr(KIND_LABEL[p.kind]).toLowerCase() }) : tr("Completează destinația finanțării în pasul 3."),
  });
  if (p.minOwnPct > 0) {
    criteria.push({
      weight: 10,
      fit: own >= p.minOwnPct ? 1 : (own / p.minOwnPct) * 0.6,
      pro: tr("Aport propriu {a} ≥ {b}% cerut.", { a: pct(own), b: p.minOwnPct }),
      con: tr("Aport propriu {a}, sub minimul orientativ de {b}%: completează avansul înainte de depunere.", { a: pct(own), b: p.minOwnPct }),
    });
  }
  criteria.push({
    weight: 10,
    fit: requested <= 0 ? 0.5 : requested <= maxAmount ? 1 : clamp(1 - (requested - maxAmount) / Math.max(maxAmount, 1), 0, 1) * 0.7,
    pro:
      requested > 0
        ? tr("Suma cerută ({a}, {b} din CA) se încadrează în plafonul estimat de {c}.", { a: ron(requested), b: pct(leverage * 100), c: ron(maxAmount) })
        : tr("Plafon estimat pentru firmă: {a}.", { a: ron(maxAmount) }),
    con: requested > 0 ? tr("Suma cerută ({a}) depășește plafonul estimat de {b}: etapizează finanțarea.", { a: ron(requested), b: ron(maxAmount) }) : tr("Completează suma solicitată în pasul 3."),
  });
  criteria.push(...p.signals(x));

  const weightSum = criteria.reduce((s, c) => s + c.weight, 0);
  let match = criteria.reduce((s, c) => s + c.weight * c.fit, 0) / weightSum;
  const conditions: string[] = [];
  if (x.legalCritical) {
    match *= 0.3;
    conditions.push(tr("portal.just.ro: există un dosar critic (insolvență / infracțiune economică) — băncile resping de regulă cererea până la clarificare."));
  } else if (x.legalScore < 60) {
    match *= 0.75;
    conditions.push(tr("Scor juridic {a}/100: pregătește o notă explicativă pe fiecare dosar activ din portal.just.ro.", { a: num(x.legalScore) }));
  } else if (x.legalScore < 80) {
    match *= 0.92;
  }
  if (x.legalPending) conditions.push(tr("Verificarea portal.just.ro nu a fost rulată: banca o face oricum la depunere."));

  const eligible =
    x.finalScore >= p.minScore && (p.minDscr === 0 || (dscrAtProduct ?? 0) >= p.minDscr) && own >= p.minOwnPct && !x.legalCritical;

  const reasons = criteria
    .filter((c) => c.fit >= 0.75)
    .sort((a, b) => b.weight * b.fit - a.weight * a.fit)
    .slice(0, 3)
    .map((c) => c.pro);
  conditions.unshift(
    ...criteria
      .filter((c) => c.fit < 0.75)
      .sort((a, b) => b.weight * (1 - b.fit) - a.weight * (1 - a.fit))
      .map((c) => c.con),
  );

  const [m0, m1] = p.maturityMonths;
  return {
    id: p.id,
    bank: p.bank,
    product: p.product,
    kind: p.kind,
    kindLabel: KIND_LABEL[p.kind],
    idealFor: p.idealFor,
    matchPct: Math.round(clamp(match, 0, 1) * 100),
    eligible,
    maxAmount,
    maxAmountBasis: basis,
    maturityLabel: p.maturityLabel ?? (m0 === m1 ? tr("{n} luni", { n: m0 }) : tr("{a}–{b} luni", { a: m0, b: m1 })),
    rateLabel: p.rateLabel ?? tr("dobândă orientativă {a}–{b}%/an", { a: num(p.rateRangePct[0]), b: num(p.rateRangePct[1]) }),
    rateRangePct: p.rateRangePct,
    minOwnPct: p.minOwnPct,
    minOwnLabel: p.ownLabel ?? (p.minOwnPct > 0 ? `min. ${p.minOwnPct}%` : tr("fără aport minim")),
    minDscr: p.minDscr,
    dscrAtProduct: dscrAtProduct === null ? null : Math.round(dscrAtProduct * 100) / 100,
    monthlyCost: Math.round(cost),
    reasons: reasons.length ? reasons : [tr("Potrivire parțială: niciun criteriu nu este îndeplinit integral încă.")],
    conditions,
  };
}

/** Ranks every product; the top pick plus up to 3 alternatives from other banks. */
export function matchBanks(x: BankMatchInput): BankMatchResult {
  const all = BANK_PRODUCTS.map((p) => evaluateProduct(p, x)).sort(
    (a, b) => b.matchPct - a.matchPct || Number(b.eligible) - Number(a.eligible) || b.maxAmount - a.maxAmount,
  );
  const top = all[0];
  const alternatives: BankRecommendation[] = [];
  const banks = new Set([top.bank]);
  for (const r of all.slice(1)) {
    if (alternatives.length >= 3) break;
    if (banks.has(r.bank)) continue;
    banks.add(r.bank);
    alternatives.push(r);
  }
  // Fewer than 3 distinct banks above: fill with the next best products.
  for (const r of all.slice(1)) if (alternatives.length < 3 && !alternatives.includes(r)) alternatives.push(r);

  const creditReady = x.finalScore >= CREDIT_READY_MIN_SCORE && !x.legalCritical;
  const readinessNote = creditReady
    ? tr("ScorFinal {a} ≥ {b}: firma poate pregăti dosarul pentru produsele de mai jos.", { a: num(x.finalScore), b: CREDIT_READY_MIN_SCORE })
    : x.legalCritical
      ? tr("Firma nu este încă „Credit Ready”: un dosar critic în portal.just.ro blochează practic orice finanțare. Clarifică-l, apoi refă evaluarea.")
      : tr("Firma nu este încă „Credit Ready” (ScorFinal {a} < {b}). Parcurge întâi planul de 30–90 de zile, apoi aplică — o cerere respinsă rămâne în istoricul băncii.", { a: num(x.finalScore), b: CREDIT_READY_MIN_SCORE });

  return { top, alternatives, all, creditReady, readinessNote, disclaimer: BANK_DISCLAIMER };
}
