/**
 * Domain types for the Credit Ready platform.
 * UI components depend only on these interfaces, never on the data source
 * (Supabase or uploaded UBL 2.1 XML; the synthetic generator exists only as a test fixture).
 */

// ---------------------------------------------------------------------------
// e-Factura invoices & company
// ---------------------------------------------------------------------------

export type InvoiceDirection = "issued" | "received";
export type InvoiceSource = "synthetic" | "xml-upload" | "supabase";

/** One RO e-Factura document (UBL 2.1 / RO_CIUS). */
export interface Invoice {
  /** Stable key: `${direction}:${supplierCui}:${number}`. */
  id: string;
  number: string;
  direction: InvoiceDirection;
  /** UBL InvoiceTypeCode / CreditNoteTypeCode: 380 = factură, 381 = storno (credit note). */
  typeCode: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string | null;
  supplierName: string;
  supplierCui: string;
  customerName: string;
  customerCui: string;
  /** TaxExclusiveAmount as in the document (RON). A 381 is a storno; a negative amount on a 380 is treated as storno too. */
  taxExclusiveAmount: number;
  /** PayableAmount (with VAT) as in the document (RON). */
  payableAmount: number;
  currency: string;
  /** Collection date. Not part of e-Factura (bank data); null = unpaid / unknown. */
  paidDate: string | null;
  source: InvoiceSource;
}

export interface Company {
  id: string;
  /** Required. Legal name as typed by the user ("Nord Fresh Distribuție SRL"). */
  name: string;
  /** OPTIONAL: "" when unknown. Without it, invoices and portal.just.ro are matched on the normalized name. */
  cui: string;
  /** OPTIONAL: "" when unknown. When present it is mapped to a benchmark sector automatically. */
  caenCode: string;
  /** Benchmark sector key (see SECTOR_BENCHMARKS) chosen by hand when the CAEN code is missing. */
  sector?: string;
  /** Required. Administrator / CEO, also searched in portal.just.ro. */
  ceoName: string;
  /** ISO timestamp, set when the company is first saved. */
  createdAt?: string;
  city: string;
  /** County of the registered office; falls back to the county of `city`. Used to locate court cases. */
  county?: string;
  /** Salaries, rent, utilities, fuel... per month (RON), DECLARED by the user (not in e-Factura). */
  monthlyFixedCosts: number;
  /** Existing loans and leasing installments per month (RON), declared (or the sum of `debts`). */
  existingMonthlyDebtService: number;
  /** True once the user declared fixed costs and existing installments; until then DSCR is not computed. */
  financialsDeclared?: boolean;
  /** Credit lines copied from the free Centrala Riscului de Credit (BNR) / Biroul de Credit report. */
  debts?: DebtLine[];
  /** Official name returned by ANAF for the CUI (portal.just.ro searches it when present). */
  officialName?: string;
  /** The user confirmed they may search the administrator by name in public court records (GDPR). */
  nameSearchConsent?: boolean;
  /**
   * Administrator CNP, validated (lib/cnp.ts) and kept ONLY masked ("1900101******") with the derived
   * birth date / county used to tell namesakes apart. The raw CNP is never stored or sent.
   */
  ceoCnpMasked?: string;
  ceoCnpInfo?: { birthDate: string; sex: "M" | "F" | null; countyCode: string; county: string };
  /** Supabase Auth user that owns the company (null / undefined = guest mode). */
  userId?: string | null;
  /** One-off pay-per-use analysis bought for this company (89 RON). */
  payPerUseUnlocked?: boolean;
}

export type DebtKind = "credit" | "leasing" | "linie" | "card" | "altele";

/** One line of the CRC / Biroul de Credit report. */
export interface DebtLine {
  id: string;
  lender: string;
  kind: DebtKind;
  /** Outstanding balance, RON. */
  balance: number;
  monthlyInstallment: number;
  /** YYYY-MM (last installment). */
  maturity: string;
  /** Current delay in days (0 = up to date). */
  daysLate: number;
}

export interface Dataset {
  source: "supabase" | "local" | "synthetic-local";
  company: Company;
  invoices: Invoice[];
}

// ---------------------------------------------------------------------------
// Business metrics computed from invoices
// ---------------------------------------------------------------------------

export interface MonthPoint {
  month: string; // YYYY-MM
  revenue: number; // net of storno, no VAT
  uploadedRevenue: number; // part of revenue coming from uploaded XML
  purchases: number;
  netCashFlow: number; // revenue - purchases - fixed costs - existing debt service
}

export interface PartyShare {
  name: string;
  cui: string;
  value: number;
  sharePct: number;
}

export interface BusinessMetrics {
  months: MonthPoint[];
  asOf: string;
  revenue12m: number;
  revenueLast3Months: number;
  annualizedRevenue: number; // monthly average x 12
  avgMonthlyRevenue: number;
  avgMonthlyPurchases: number;
  revenueCv: number; // coefficient of variation of monthly revenue
  seasonalityRatio: number; // best month / weakest month
  peakMonth: string;
  troughMonth: string;
  dsoDays: number; // amount-weighted days from issue to collection
  avgPaymentTermDays: number; // amount-weighted (due - issue)
  lateSharePct: number; // % of value collected >5 days late or overdue
  lateCount: number;
  overdueAmount: number;
  topClients: PartyShare[];
  topClientSharePct: number;
  topSuppliers: PartyShare[];
  creditNotesSharePct3m: number; // storno value / issued value, last 3 months
  creditNotesSharePct12m: number;
  grossMarginPct: number;
  operatingCashFlow: number; // monthly avg, before any debt service
  avgMonthlyNetCashFlow: number; // monthly avg, after existing debt service
  issuedCount: number;
  receivedCount: number;
  uploadedCount: number;
}

export interface SubScore {
  id: "stability" | "payments" | "seasonality" | "concentration" | "repayment";
  label: string;
  weight: number; // within S_Business, sums to 1
  score: number; // 0-100
  value: string; // human-readable metric
  rule: string; // transparent formula
}

export interface BusinessScore {
  score: number;
  items: SubScore[];
  /** Estimated monthly installment of the requested loan (annuity), RON. */
  loanInstallment: number;
  /** EBITDA (operating cash flow) / total monthly debt service (existing + new). 99 = no debt at all. */
  dscr: number;
  /** Indicative loan terms used for the installment. */
  loan: { annualRatePct: number; months: number };
  /** Off-season resilience: can the firm pay its fixed costs and installments in its 3 weakest months? */
  resilience: {
    weakMonths: string[];
    weakMonthsAvgRevenue: number;
    /** Gross margin earned in the weak months (revenue × gross margin), RON / month. */
    weakMonthsMargin: number;
    /** Fixed costs + existing debt service + new installment, RON / month. */
    monthlyObligations: number;
    ratio: number;
  };
  /** True when storno (381) > 5% of issued value in the last 3 months: -15 p on the DSO sub-score. */
  stornoPenaltyApplied: boolean;
}

// ---------------------------------------------------------------------------
// Sector benchmark
// ---------------------------------------------------------------------------

export interface SectorBenchmark {
  /** Sector key: the reference CAEN code, or "IMM" for the all-sector SME benchmark. */
  caenCode: string;
  /** Short sector name shown in the dropdown ("HoReCa", "Distribuție", "IT"...). */
  shortLabel: string;
  label: string;
  /** Seasonal sectors (HoReCa, agriculture, food production) — used by the bank matcher. */
  seasonal: boolean;
  companies: number;
  /** For each indicator: [25th percentile, median, 75th percentile]. */
  dsoDays: [number, number, number];
  topClientSharePct: [number, number, number];
  creditNotesPct: [number, number, number];
  seasonalityRatio: [number, number, number];
  grossMarginPct: [number, number, number];
}

export interface BenchmarkItem {
  id: string;
  label: string;
  unit: string;
  company: number;
  p25: number;
  median: number;
  p75: number;
  higherIsBetter: boolean;
  score: number;
  verdict: "mai bun" | "la nivel" | "mai slab";
}

export interface BenchmarkResult {
  sector: SectorBenchmark;
  items: BenchmarkItem[];
  score: number;
}

// ---------------------------------------------------------------------------
// Quiz - Financial knowledge
// ---------------------------------------------------------------------------

export type PaymentTermBucket = "0-7" | "15" | "30" | "45+";
export type ClientShareBucket = "<15" | "15-30" | "30-50" | ">50";

/** Ground truth the quiz is validated against (derived live from BusinessMetrics). */
export interface QuizGroundTruth {
  revenueLast3MonthsNoVat: number;
  avgPaymentTermDays: number;
  topClientSharePct: number;
  topClientName: string;
  topSuppliers: { name: string; cui: string; purchaseValue: number }[];
  creditNotesSharePct: number;
}

export interface QuizAnswers {
  revenueEstimate: number | null;
  paymentTerm: PaymentTermBucket | null;
  topClientShare: ClientShareBucket | null;
  mainSupplier: string | null;
  hasSignificantCreditNotes: boolean | null;
}

export interface QuestionFeedback {
  id: string;
  question: string;
  userAnswer: string;
  truthAnswer: string;
  detail: string;
  points: number;
  maxPoints: number;
}

export type QuizLevel = "ridicat" | "bun" | "partial" | "deconectat";

export interface QuizEvaluation {
  total: number; // 0-100
  items: QuestionFeedback[];
  answered: number; // 0-5
  level: QuizLevel;
  levelLabel: string;
  flags: string[];
}

// ---------------------------------------------------------------------------
// Investment purpose
// ---------------------------------------------------------------------------

export type InvestmentPurpose = "growth" | "working_capital" | "marketing" | "refinancing";

export type CollateralKind = "imobil" | "echipament" | "fngcimm" | "fara";

export interface InvestmentInput {
  purpose: InvestmentPurpose | null;
  ownContributionPct: number | null;
  requestedAmount: number | null;
  /** Loan maturity in months for the simulator (default 60). */
  termMonths?: number;
  /** What the firm can offer as guarantee and its market value (RON). */
  collateral?: { kind: CollateralKind; value: number };
}

export interface InvestmentEvaluation {
  total: number; // 0-100
  items: QuestionFeedback[];
  leverageRatio: number; // requested / annualized revenue
  overLeveragedRequest: boolean;
}

// ---------------------------------------------------------------------------
// Legal check - portal.just.ro
// ---------------------------------------------------------------------------

/** What the case is about, derived from categorie + obiect. */
export type CaseKind =
  | "insolventa"
  | "penal_economic"
  | "penal_grav"
  | "penal_usor"
  | "penal_procedural"
  | "contraventie"
  | "executare"
  | "civil_comercial"
  | "fiscal"
  | "munca"
  | "familie_patrimoniu"
  | "altele";

/** How the case ended (or not) for the searched party. */
export type CaseOutcome =
  | "in_curs"
  | "condamnat"
  | "vinovat_fara_pedeapsa" // renunțare la aplicarea pedepsei / amânarea aplicării pedepsei
  | "incetat" // prescripție, împăcare, retragerea plângerii
  | "achitat"
  | "clasat"
  | "sanctiune_mentinuta" // contravenție: plângere respinsă
  | "sanctiune_anulata" // contravenție: plângere admisă
  | "avertisment"
  | "pierdut"
  | "castigat"
  | "inchis_fara_fond" // renunțare, perimare, anulare, declinare
  | "necunoscut";

/** 0 = fără impact, 1 = minor, 2 = moderat, 3 = grav, 4 = critic. */
export type SeverityLevel = 0 | 1 | 2 | 3 | 4;

/** One court hearing as returned by portal.just.ro. */
export interface CourtHearing {
  data: string; // ISO date
  solutie: string;
  solutieSumar: string;
  documentSedinta: string;
}

/**
 * How the searched party is involved in a case:
 *  - "vizat":      the case targets them (Debitor, Inculpat, Pârât, Suspect...)
 *  - "nevizat":    they are on the other side (Creditor, Reclamant, Parte vătămată...)
 *  - "necunoscut": role missing or ambiguous (Intimat, Petent, Apelant...) — treated conservatively
 */
export type PartyRoleCategory = "vizat" | "nevizat" | "necunoscut";

export interface CourtCase {
  numar: string;
  institutie: string;
  data: string;
  obiect: string;
  categorie: string;
  stadiu: string;
  parti: string[];
  matchedBy: "firma" | "administrator";
  /** calitateParte of every party matching the searched name (e.g. ["Debitor"]). */
  partyRoles: string[];
  roleCategory: PartyRoleCategory;
  /** Critical = severity level 4 (legal score drops to 0). */
  isCritical: boolean;
  kind: CaseKind;
  kindLabel: string;
  outcome: CaseOutcome;
  outcomeLabel: string;
  /** true = hotărâre definitivă, false = se poate ataca, null = necunoscut / în curs. */
  isFinal: boolean | null;
  /** Date of the hearing the outcome was read from (ISO). */
  decisionDate: string;
  /** Next scheduled hearing, if any (ISO). */
  nextHearing: string;
  /** Part of the court's ruling that concerns the searched party. */
  verdictExcerpt: string;
  severity: SeverityLevel;
  severityLabel: string;
  /** Points subtracted from the 100-point legal score for this case. */
  deduction: number;
  /** Step-by-step explanation of the level and deduction. */
  reasons: string[];
  /**
   * How sure we are the case belongs to the searched party (portal.just.ro has no CNP):
   * "ridicata" = firm name, or the firm is a party too; "medie" = court in the firm's county;
   * "scazuta" = court in another county (probable namesake). Missing on old saved results.
   */
  confidence?: "ridicata" | "medie" | "scazuta";
  confidenceReasons?: string[];
  /** The user's answer: it is their case, or a namesake (the bank re-checks with the CNP). */
  userVerdict?: "confirmat" | "contestat";
}

export interface LegalCheckResult {
  query: { companyName: string; ceoName: string; companyCounty?: string };
  /** "fallback" = the portal did not answer: no score, nothing assumed. */
  source: "portal.just.ro" | "fallback";
  isFallback: boolean;
  cases: CourtCase[];
  totalFound: number;
  /** Cases the portal returned where no party had exactly the searched name. */
  excludedCount: number;
  criticalCount: number;
  /** Sum of deductions before flooring at 0. */
  totalDeduction: number;
  /** True when the cap on minor (level 1) deductions kicked in. */
  minorCapApplied: boolean;
  /** 0-100 legal score. */
  legalScore: number;
  /** At least one critical (level 4) case: legal score forced to 0 and a red alert is shown. */
  integrityKillSwitch: boolean;
  /** Administrator cases with uncertain identity the user has not confirmed or disputed yet. */
  uncertainCount?: number;
  message: string;
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Final score & action plan
// ---------------------------------------------------------------------------

export type ScoreStatus = "Bank-Ready" | "Pregătit cu rezerve" | "Necesită optimizare" | "Risc ridicat";

export interface FinalScoreResult {
  finalScore: number; // 0-100 after kill-switch
  rawScore: number;
  status: ScoreStatus;
  pillars: {
    business: { score: number; points: number; maxPoints: 70 };
    human: { score: number; points: number; maxPoints: 15; quizScore: number; legalScore: number | null; /** Set when S_Uman used ScorVerificariExterne (5 real sources). */ externalScore?: number };
    investment: { score: number; points: number; maxPoints: 15; formScore: number; benchmarkScore: number };
  };
  quizKillSwitch: boolean;
  warnings: string[];
  /**
   * False while real data is missing (no e-Factura invoices, financials not declared, no external check
   * answered). The UI then shows "—" instead of a number: a score is never computed on invented inputs.
   */
  complete?: boolean;
  /** What is still missing for a complete score (human-readable). */
  missing?: string[];
}

export interface ScoreDriver {
  id: string;
  label: string;
  pillar: "Business" | "Factor uman" | "Investiție";
  lostPoints: number; // points of the final score lost on this factor
  detail: string;
}

export interface ActionItem {
  id: string;
  title: string;
  why: string;
  steps: string[];
  horizon: 30 | 60 | 90;
  priority: "critică" | "ridicată" | "medie";
  impactPoints: number; // estimated gain on the final score
}
