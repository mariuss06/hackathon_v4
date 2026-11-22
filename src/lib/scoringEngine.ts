/**
 * Pure scoring functions. No I/O, no React, no Next.js — easy to unit test
 * and reuse server-side (e.g. inside a Supabase edge function later).
 *
 * Only type imports here (relative path) so `node --test` can run this file
 * directly with Node's built-in TypeScript stripping.
 */
import type {
  BenchmarkItem,
  BenchmarkResult,
  BusinessMetrics,
  CaseKind,
  CaseOutcome,
  ClientShareBucket,
  CourtCase,
  CourtHearing,
  InvestmentEvaluation,
  InvestmentInput,
  InvestmentPurpose,
  LegalCheckResult,
  PartyRoleCategory,
  PaymentTermBucket,
  QuestionFeedback,
  QuizAnswers,
  QuizEvaluation,
  QuizGroundTruth,
  QuizLevel,
  SectorBenchmark,
  SeverityLevel,
} from "../types/scoring";
import { piecewise, round1 } from "./util.ts";
import { tr } from "./i18n/tr.ts";

export { round1 };

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

export const PAYMENT_TERM_BUCKETS: { value: PaymentTermBucket; label: string }[] = [
  { value: "0-7", label: tr("0-7 zile") },
  { value: "15", label: tr("15 zile") },
  { value: "30", label: tr("30 zile") },
  { value: "45+", label: tr("45+ zile") },
];

export const CLIENT_SHARE_BUCKETS: { value: ClientShareBucket; label: string }[] = [
  { value: "<15", label: tr("sub 15%") },
  { value: "15-30", label: "15-30%" },
  { value: "30-50", label: "30-50%" },
  { value: ">50", label: tr("peste 50%") },
];

export const INVESTMENT_PURPOSES: {
  value: InvestmentPurpose;
  label: string;
  hint: string;
  points: number;
}[] = [
  { value: "growth", label: tr("Creștere / eficiență măsurabilă"), hint: "Utilaje, echipamente, tehnologie", points: 50 },
  { value: "working_capital", label: tr("Capital de lucru"), hint: tr("Contracte ferme sau stocuri sezoniere"), points: 35 },
  { value: "marketing", label: tr("Marketing și digitalizare"), hint: tr("Campanii, software, reamenajare spațiu"), points: 25 },
  { value: "refinancing", label: tr("Refinanțare / lichiditate"), hint: tr("Datorii existente sau goluri de cash"), points: 10 },
];

/** Significant storno threshold (% of total issued). */
export const CREDIT_NOTE_THRESHOLD_PCT = 5;
/** Quiz score 0-34 = "deconectare de la cifre": kill-switch. */
export const QUIZ_CONTROL_THRESHOLD = 35;
export const QUIZ_CONTROL_PENALTY = 10;

/** Extra quiz option instead of invented distractor names: the real supplier is not among the listed ones. */
export const OTHER_SUPPLIER = tr("Alt furnizor (nu e în listă)");

const ron = (n: number) =>
  `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(n)} RON`;
const pct = (n: number) =>
  `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 }).format(n)}%`;

export function paymentTermToBucket(days: number): PaymentTermBucket {
  if (days <= 10) return "0-7";
  if (days <= 22) return "15";
  if (days <= 37) return "30";
  return "45+";
}

export function clientShareToBucket(sharePct: number): ClientShareBucket {
  if (sharePct < 15) return "<15";
  if (sharePct <= 30) return "15-30";
  if (sharePct <= 50) return "30-50";
  return ">50";
}

export function rankSuppliers(truth: QuizGroundTruth) {
  return [...truth.topSuppliers].sort((a, b) => b.purchaseValue - a.purchaseValue);
}

/** The quiz is always validated against the CURRENT e-Factura data (re-run after each upload). */
export function quizTruthFromMetrics(m: BusinessMetrics): QuizGroundTruth {
  return {
    revenueLast3MonthsNoVat: m.revenueLast3Months,
    avgPaymentTermDays: m.avgPaymentTermDays,
    topClientSharePct: m.topClientSharePct,
    topClientName: m.topClients[0]?.name ?? "—",
    topSuppliers: m.topSuppliers.map((s) => ({ name: s.name, cui: s.cui, purchaseValue: s.value })),
    creditNotesSharePct: m.creditNotesSharePct3m,
  };
}

/** Options for quiz question 4: the real top suppliers from the uploaded invoices (alphabetical) + "another supplier". */
export function supplierOptions(truth: QuizGroundTruth) {
  return [...[...new Set(truth.topSuppliers.map((s) => s.name))].sort((a, b) => a.localeCompare(b, "ro")), OTHER_SUPPLIER];
}

export function quizLevel(total: number): { level: QuizLevel; label: string } {
  if (total >= 85) return { level: "ridicat", label: "Control financiar ridicat" };
  if (total >= 60) return { level: "bun", label: "Control financiar bun" };
  if (total >= QUIZ_CONTROL_THRESHOLD) return { level: "partial", label: tr("Vizibilitate parțială") };
  return { level: "deconectat", label: tr("Deconectare de la cifre") };
}

const labelOf = <T extends string>(list: { value: T; label: string }[], v: T | null) =>
  v === null ? "—" : (list.find((x) => x.value === v)?.label ?? v);

const indexOf = <T extends string>(list: { value: T }[], v: T) =>
  list.findIndex((x) => x.value === v);

// ---------------------------------------------------------------------------
// Quiz 1 — Financial knowledge (0-100)
// ---------------------------------------------------------------------------

export function scoreRevenueEstimate(estimate: number | null, actual: number) {
  if (estimate === null || !Number.isFinite(estimate) || actual <= 0) {
    return { points: 0, relativeError: null as number | null };
  }
  const relativeError = Math.abs(estimate - actual) / actual;
  // Compare on a rounded basis to avoid float noise exactly at thresholds.
  const e = Math.round(relativeError * 1e6) / 1e6;
  const points = e <= 0.1 ? 35 : e <= 0.2 ? 24 : e <= 0.35 ? 10 : 0;
  return { points, relativeError };
}

function scoreBucketDistance(distance: number, exact: number, neighbour: number) {
  if (distance === 0) return exact;
  if (distance === 1) return neighbour;
  return 0;
}

export function evaluateFinancialQuiz(
  answers: QuizAnswers,
  groundTruth: QuizGroundTruth,
): QuizEvaluation {
  const items: QuestionFeedback[] = [];

  // Q1 — revenue last 3 months (max 35)
  const actualRev = groundTruth.revenueLast3MonthsNoVat;
  const q1 = scoreRevenueEstimate(answers.revenueEstimate, actualRev);
  items.push({
    id: "revenue",
    question: tr("Cifra de afaceri facturată în ultimele 3 luni (fără TVA)"),
    userAnswer: answers.revenueEstimate === null ? "—" : ron(answers.revenueEstimate),
    truthAnswer: ron(actualRev),
    detail:
      q1.relativeError === null
        ? tr("Nicio estimare validă.")
        : tr("Ai estimat {a} vs. {b} în e-Factura — abatere {c}", { a: ron(answers.revenueEstimate!), b: ron(actualRev), c: pct(q1.relativeError * 100) }),
    points: q1.points,
    maxPoints: 35,
  });

  // Q2 — average payment term (max 25)
  const truthTerm = paymentTermToBucket(groundTruth.avgPaymentTermDays);
  let q2 = 0;
  let q2Detail = tr("Niciun răspuns.");
  if (answers.paymentTerm) {
    const d = Math.abs(
      indexOf(PAYMENT_TERM_BUCKETS, answers.paymentTerm) - indexOf(PAYMENT_TERM_BUCKETS, truthTerm),
    );
    q2 = scoreBucketDistance(d, 25, 12);
    q2Detail =
      d === 0
        ? tr("Potrivire exactă — termen mediu real {a} zile", { a: groundTruth.avgPaymentTermDays })
        : `${d === 1 ? "Interval vecin" : tr("La {a} intervale distanță", { a: d })} — termen mediu real ${groundTruth.avgPaymentTermDays} zile`;
  }
  items.push({
    id: "paymentTerm",
    question: tr("Termenul mediu de plată oferit clienților"),
    userAnswer: labelOf(PAYMENT_TERM_BUCKETS, answers.paymentTerm),
    truthAnswer: labelOf(PAYMENT_TERM_BUCKETS, truthTerm),
    detail: q2Detail,
    points: q2,
    maxPoints: 25,
  });

  // Q3 — top client share (max 20)
  const truthShare = clientShareToBucket(groundTruth.topClientSharePct);
  let q3 = 0;
  let q3Detail = tr("Niciun răspuns.");
  if (answers.topClientShare) {
    const d = Math.abs(
      indexOf(CLIENT_SHARE_BUCKETS, answers.topClientShare) - indexOf(CLIENT_SHARE_BUCKETS, truthShare),
    );
    q3 = scoreBucketDistance(d, 20, 10);
    q3Detail = `${d === 0 ? "Potrivire exactă" : d === 1 ? "Prag vecin" : tr("La {a} praguri distanță", { a: d })} — ${groundTruth.topClientName} are ${pct(groundTruth.topClientSharePct)} din vânzări`;
  }
  items.push({
    id: "topClientShare",
    question: tr("Ponderea celui mai mare client în totalul vânzărilor"),
    userAnswer: labelOf(CLIENT_SHARE_BUCKETS, answers.topClientShare),
    truthAnswer: labelOf(CLIENT_SHARE_BUCKETS, truthShare),
    detail: q3Detail,
    points: q3,
    maxPoints: 20,
  });

  // Q4 — main supplier (max 12)
  const ranked = rankSuppliers(groundTruth);
  const rank = answers.mainSupplier ? ranked.findIndex((s) => s.name === answers.mainSupplier) : -1;
  const q4 = rank === 0 ? 12 : rank === 1 || rank === 2 ? 6 : 0;
  items.push({
    id: "mainSupplier",
    question: tr("Principalul furnizor după valoarea achizițiilor"),
    userAnswer: answers.mainSupplier ?? "—",
    truthAnswer: ranked[0]?.name ?? "—",
    detail:
      rank === 0
        ? tr("Corect — {a} achiziții", { a: ron(ranked[0].purchaseValue) })
        : rank > 0
          ? tr("Furnizorul ales este #{a} în e-Factura ({b})", { a: rank + 1, b: ron(ranked[rank].purchaseValue) })
          : answers.mainSupplier
            ? tr("Acest nume nu apare în top furnizori e-Factura")
            : tr("Niciun răspuns."),
    points: q4,
    maxPoints: 12,
  });

  // Q5 — significant credit notes (max 8)
  const truthStorno = groundTruth.creditNotesSharePct > CREDIT_NOTE_THRESHOLD_PCT;
  const q5 = answers.hasSignificantCreditNotes === truthStorno ? 8 : 0;
  items.push({
    id: "creditNotes",
    question: tr("Facturi stornate semnificative (>5%, cod 381) în ultimele 3 luni"),
    userAnswer:
      answers.hasSignificantCreditNotes === null ? "—" : answers.hasSignificantCreditNotes ? "Da" : "Nu",
    truthAnswer: truthStorno ? "Da" : "Nu",
    detail: tr("Stornările reprezintă {a} din totalul emis", { a: pct(groundTruth.creditNotesSharePct) }),
    points: q5,
    maxPoints: 8,
  });

  const total = items.reduce((s, i) => s + i.points, 0);
  const answered = [
    answers.revenueEstimate !== null,
    answers.paymentTerm !== null,
    answers.topClientShare !== null,
    answers.mainSupplier !== null,
    answers.hasSignificantCreditNotes !== null,
  ].filter(Boolean).length;
  const { level, label } = quizLevel(total);
  const flags: string[] = [];
  if (answers.revenueEstimate !== null && q1.points === 0) flags.push(tr("Lipsă control financiar: cifra de afaceri estimată diferă cu peste 35% de e-Factura."));
  if (level === "partial") flags.push(tr("Vizibilitate parțială: monitorizează lunar încasările și concentrarea pe clienți."));
  if (level === "deconectat") flags.push(tr("Deconectare de la cifre: se aplică kill-switch-ul de guvernanță (-10 puncte din scorul final)."));

  return { total, items, answered, level, levelLabel: label, flags };
}

// ---------------------------------------------------------------------------
// Quiz 2 — Investment purpose (0-100)
// ---------------------------------------------------------------------------

export function evaluateInvestment(
  input: InvestmentInput,
  annualizedRevenue: number,
): InvestmentEvaluation {
  const items: QuestionFeedback[] = [];

  const purpose = INVESTMENT_PURPOSES.find((p) => p.value === input.purpose);
  items.push({
    id: "purpose",
    question: tr("Destinația principală a finanțării"),
    userAnswer: purpose?.label ?? "—",
    truthAnswer: tr("Creștere / eficiență măsurabilă"),
    detail: purpose ? purpose.hint : tr("Niciun răspuns."),
    points: purpose?.points ?? 0,
    maxPoints: 50,
  });

  const own = input.ownContributionPct;
  const q2 = own === null ? 0 : own > 20 ? 30 : own >= 10 ? 20 : 5;
  items.push({
    id: "ownContribution",
    question: "Aportul propriu / avans",
    userAnswer: own === null ? "—" : pct(own),
    truthAnswer: tr("peste 20%"),
    detail: own === null ? "Niciun răspuns." : own > 20 ? "Implicare puternică a acționarilor" : own >= 10 ? "Aport moderat (10-20%)" : "Aport sub 10% — risc transferat integral băncii",
    points: q2,
    maxPoints: 30,
  });

  const amount = input.requestedAmount ?? 0;
  const ratio = annualizedRevenue > 0 ? amount / annualizedRevenue : Number.POSITIVE_INFINITY;
  const r = Math.round(ratio * 1e6) / 1e6;
  const q3 = amount > 0 && r <= 0.25 ? 20 : amount > 0 && r <= 0.5 ? 12 : 0;
  const overLeveragedRequest = amount > 0 && r > 0.5;
  items.push({
    id: "leverage",
    question: tr("Suma solicitată vs. cifra de afaceri anualizată"),
    userAnswer: input.requestedAmount === null ? "—" : ron(amount),
    truthAnswer: `max. 25% = ${ron(annualizedRevenue * 0.25)}`,
    detail:
      amount > 0 && Number.isFinite(ratio)
        ? tr("{a} reprezintă {b} din CA anualizată ({c}){d}", { a: ron(amount), b: pct(ratio * 100), c: ron(annualizedRevenue), d: overLeveragedRequest ? " — cerere supra-îndatorată" : "" })
        : tr("Sumă invalidă."),
    points: q3,
    maxPoints: 20,
  });

  return {
    total: items.reduce((s, i) => s + i.points, 0),
    items,
    leverageRatio: ratio,
    overLeveragedRequest,
  };
}

// ---------------------------------------------------------------------------
// Legal check — portal.just.ro (0-100)
// ---------------------------------------------------------------------------

/** Lowercase + strip diacritics (ă, â, î, ș/ş, ț/ţ). */
export function normalizeRo(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Company-form words ignored when comparing company names ("SC X SRL" = "X S.R.L."). */
const LEGAL_FORM_TOKENS = new Set(["sc", "srl", "srld", "sa", "snc", "scs", "sca", "ra", "pfa", "ii", "if"]);

function nameTokens(name: string, type: "persoana" | "firma") {
  let s = normalizeRo(name).replace(/\(.*?\)/g, " ");
  // "SC X SRL prin lichidator Y" / "POPESCU ION - mandatar" -> keep only the party itself.
  s = s.split(/\s+prin\s+|\s+-\s+/)[0].replace(/\./g, "");
  const tokens = s.split(/[^a-z0-9]+/).filter(Boolean);
  return (type === "firma" ? tokens.filter((t) => !LEGAL_FORM_TOKENS.has(t)) : tokens).sort();
}

/**
 * Exact full-name match: the party has exactly the searched words, no more, no less
 * (any order, case/diacritics-insensitive). portal.just.ro itself matches ANY word,
 * so "Ducai Raul" also returns every "Ducai" and every "Raul" — those are dropped here.
 */
export function partyNameExact(partyName: string, searched: string, type: "persoana" | "firma" = "persoana") {
  const want = nameTokens(searched, type);
  const have = nameTokens(partyName, type);
  return want.length > 0 && have.length === want.length && have.every((t, i) => t === want[i]);
}

// ---- Identity confidence ---------------------------------------------------
// portal.just.ro publishes no CNP/CUI, so an exact name can still be a namesake.
// Signals available without CNP: the firm in the same case, and where the court is.

/** The 41 counties + Bucharest, with their seat (used to locate courts). */
export const COUNTIES: { name: string; seat: string }[] = [
  { name: "Alba", seat: "Alba Iulia" },
  { name: "Arad", seat: "Arad" },
  { name: "Argeș", seat: "Pitești" },
  { name: "Bacău", seat: "Bacău" },
  { name: "Bihor", seat: "Oradea" },
  { name: "Bistrița-Năsăud", seat: "Bistrița" },
  { name: "Botoșani", seat: "Botoșani" },
  { name: "Brașov", seat: "Brașov" },
  { name: "Brăila", seat: "Brăila" },
  { name: "București", seat: "București" },
  { name: "Buzău", seat: "Buzău" },
  { name: "Caraș-Severin", seat: "Reșița" },
  { name: "Călărași", seat: "Călărași" },
  { name: "Cluj", seat: "Cluj-Napoca" },
  { name: "Constanța", seat: "Constanța" },
  { name: "Covasna", seat: "Sfântu Gheorghe" },
  { name: "Dâmbovița", seat: "Târgoviște" },
  { name: "Dolj", seat: "Craiova" },
  { name: "Galați", seat: "Galați" },
  { name: "Giurgiu", seat: "Giurgiu" },
  { name: "Gorj", seat: "Târgu Jiu" },
  { name: "Harghita", seat: "Miercurea Ciuc" },
  { name: "Hunedoara", seat: "Deva" },
  { name: "Ialomița", seat: "Slobozia" },
  { name: "Iași", seat: "Iași" },
  { name: "Ilfov", seat: "Buftea" },
  { name: "Maramureș", seat: "Baia Mare" },
  { name: "Mehedinți", seat: "Drobeta-Turnu Severin" },
  { name: "Mureș", seat: "Târgu Mureș" },
  { name: "Neamț", seat: "Piatra Neamț" },
  { name: "Olt", seat: "Slatina" },
  { name: "Prahova", seat: "Ploiești" },
  { name: "Satu Mare", seat: "Satu Mare" },
  { name: "Sălaj", seat: "Zalău" },
  { name: "Sibiu", seat: "Sibiu" },
  { name: "Suceava", seat: "Suceava" },
  { name: "Teleorman", seat: "Alexandria" },
  { name: "Timiș", seat: "Timișoara" },
  { name: "Tulcea", seat: "Tulcea" },
  { name: "Vaslui", seat: "Vaslui" },
  { name: "Vâlcea", seat: "Râmnicu Vâlcea" },
  { name: "Vrancea", seat: "Focșani" },
];

/** Courts of appeal cover several counties (keyed by the county of their seat). */
const APPEAL_REGIONS: Record<string, string[]> = {
  Alba: ["Alba", "Hunedoara", "Sibiu"],
  Bacău: ["Bacău", "Neamț"],
  Brașov: ["Brașov", "Covasna"],
  București: ["București", "Ilfov", "Călărași", "Giurgiu", "Ialomița", "Teleorman"],
  Cluj: ["Cluj", "Bistrița-Năsăud", "Maramureș", "Sălaj"],
  Constanța: ["Constanța", "Tulcea"],
  Dolj: ["Dolj", "Gorj", "Mehedinți", "Olt"],
  Galați: ["Galați", "Brăila", "Vrancea"],
  Iași: ["Iași", "Botoșani", "Vaslui"],
  Bihor: ["Bihor", "Satu Mare"],
  Argeș: ["Argeș", "Vâlcea"],
  Prahova: ["Prahova", "Buzău", "Dâmbovița"],
  Suceava: ["Suceava"],
  Mureș: ["Mureș", "Harghita"],
  Timiș: ["Timiș", "Arad", "Caraș-Severin"],
};

const compact = (s: string) => normalizeRo(s).replace(/[^a-z]/g, "");

/** County named in a place/court string ("Judecatoria CLUJNAPOCA" -> "Cluj"); "" if none or ambiguous. */
export function countyOf(place: string) {
  const p = compact(place).replace(/^(judecatoria|tribunalul|curteadeapel)(specializat|comercial|pentruminorisifamilie)?/, "");
  if (!p) return "";
  const hits = new Set(COUNTIES.filter((c) => p.includes(compact(c.name)) || p.includes(compact(c.seat))).map((c) => c.name));
  return hits.size === 1 ? [...hits][0] : "";
}

/** County of the firm's registered office: the chosen county ("" = unknown), else the county of its city. */
export const companyCounty = (c: { county?: string; city?: string }) => c.county ?? countyOf(c.city ?? "");

/** Counties a court has jurisdiction over (empty = unknown or national). */
export function courtCounties(institutie: string): string[] {
  const c = compact(institutie);
  if (!c || c.includes("inaltacurte")) return [];
  const county = countyOf(institutie);
  if (!county) return [];
  return c.startsWith("curteadeapel") ? (APPEAL_REGIONS[county] ?? [county]) : [county];
}

export type IdentityConfidence = "ridicata" | "medie" | "scazuta";

export const CONFIDENCE_LABEL: Record<IdentityConfidence, string> = {
  ridicata: tr("Identitate sigură"),
  medie: tr("Identitate probabilă"),
  scazuta: "Probabil omonim",
};

export interface IdentityInput {
  matchedBy: CourtCase["matchedBy"];
  /** Every party name in the case (not only the matched one). */
  partyNames: string[];
  institutie: string;
  companyName: string;
  /** County of the firm's registered office ("" = unknown). */
  companyCounty: string;
}

/** How sure we are that a case found by name really belongs to the searched firm / person. */
export function assessIdentity(input: IdentityInput): { confidence: IdentityConfidence; reasons: string[] } {
  if (input.matchedBy === "firma") {
    return {
      confidence: "ridicata",
      reasons: [tr("Denumirea firmei este unică în Registrul Comerțului, iar numele din dosar se potrivește exact.")],
    };
  }
  const noCnp = tr("Portalul nu publică CNP-ul, deci numele singur nu dovedește că e aceeași persoană.");
  if (input.companyName && input.partyNames.some((n) => partyNameExact(n, input.companyName, "firma"))) {
    return {
      confidence: "ridicata",
      reasons: [tr("{a} Firma apare și ea ca parte în același dosar: legătură directă cu administratorul.", { a: noCnp })],
    };
  }
  const area = courtCounties(input.institutie);
  const county = input.companyCounty;
  if (!county || area.length === 0) {
    return {
      confidence: "medie",
      reasons: [
        tr("{a} {b}, deci localizarea nu poate fi comparată.", { a: noCnp, b: !county ? "Județul sediului firmei nu e completat" : tr("Județul instanței nu a putut fi stabilit") }),
      ],
    };
  }
  if (area.includes(county)) {
    return {
      confidence: "medie",
      reasons: [tr("{a} Instanța este în zona sediului firmei (județul {b}), deci e plauzibil să fie administratorul, dar poate fi și un omonim din același județ.", { a: noCnp, b: county })],
    };
  }
  return {
    confidence: "scazuta",
    reasons: [`${noCnp} Instanța este în ${area.length > 1 ? `regiunea ${area.join(", ")}` : tr("județul {a}", { a: area[0] })}, iar firma are sediul în județul ${county}: probabil un omonim.`],
  };
}

/** Share of the deduction applied before the user confirms the case is theirs. */
export const CONFIDENCE_WEIGHT: Record<IdentityConfidence, number> = { ridicata: 1, medie: 0.5, scazuta: 0 };

type ImpactCase = Pick<CourtCase, "severity" | "deduction"> & Partial<Pick<CourtCase, "confidence" | "userVerdict">>;

/** Does the user still need to confirm or dispute this case? */
export function needsConfirmation(c: ImpactCase) {
  return !c.userVerdict && c.severity > 0 && (c.confidence === "medie" || c.confidence === "scazuta");
}

/**
 * Severity and deduction that actually count, after identity confidence and the user's answer:
 * disputed or probable namesake → 0; probable identity → half, and a critical case
 * counts as "grav" (no kill-switch) until confirmed. Old results without confidence count in full.
 */
export function caseImpact(c: ImpactCase): { severity: SeverityLevel; deduction: number } {
  if (c.userVerdict === "contestat") return { severity: 0, deduction: 0 };
  if (c.userVerdict === "confirmat" || !c.confidence || c.confidence === "ridicata") return { severity: c.severity, deduction: c.deduction };
  if (c.confidence === "scazuta") return { severity: 0, deduction: 0 };
  if (c.severity === 4) return { severity: 3, deduction: SEVERITY_DEDUCTION[3] };
  return { severity: c.severity, deduction: Math.round(c.deduction * CONFIDENCE_WEIGHT.medie) };
}

/** Short impact text for a case badge, e.g. "-4 p (din 8) până la confirmare". */
export function impactLabel(c: ImpactCase) {
  const eff = caseImpact(c);
  const full = c.severity === 4 ? tr("scor legal 0") : `-${c.deduction} p`;
  if (eff.severity === c.severity && eff.deduction === c.deduction) return full;
  if (c.userVerdict === "contestat") return tr("0 p (contestat)");
  return `${eff.deduction === 0 ? "0 p" : `-${eff.deduction} p`} ${tr("până la confirmare (complet: {f})", { f: full })}`;
}

/** Roles where the case is directed AGAINST the searched party. */
const TARGETED_ROLES = [
  "debitor",
  "inculpat",
  "parat", // Pârât / Pârâtă
  "suspect",
  "faptuitor",
  "condamnat",
  "responsabil", // Parte responsabilă civilmente
  "revizuent",
];

/** Roles where the searched party is on the OTHER side (victim, claimant, creditor, witness). */
const NON_TARGETED_ROLES = [
  "creditor",
  "reclamant",
  "vatamat", // Parte vătămată
  "parte civila",
  "martor",
  "lichidator",
  "administrator judiciar",
];

export function classifyPartyRole(role: string): PartyRoleCategory {
  const r = normalizeRo(role);
  if (!r.trim()) return "necunoscut";
  // Targeted wins: "Debitor/Creditor" style compound roles stay risky.
  if (TARGETED_ROLES.some((k) => r.includes(k))) return "vizat";
  if (NON_TARGETED_ROLES.some((k) => r.includes(k))) return "nevizat";
  return "necunoscut";
}

// ---- Case type -------------------------------------------------------------

const ECONOMIC_RE =
  /evaziun|inselaciun|delapidar|spalar|abuz(ul)? in serviciu|abuz(ul)? de incredere|mita|trafic(ul)? de influenta|fals|bancrut|operatiuni financiare|fraud|gestiune(a)? frauduloasa|78\/2000|241\/2005|656\/2002|deturnar|camata|conflict(ul)? de interese|grup infractional|contrabanda|insusire|obtinere(a)? ilegala de fonduri/;
const LIGHT_PENAL_RE =
  /conducer|permis|alcool|imbibatie|tulburarea ordinii|amenintar|insult|distrugere|neglijent|parasirea locului|din culpa|lovirea|hartuire|violare(a)? de domiciliu|abandon de familie|neplata pensiei|prelevare|nerespectarea (masurilor|hotararilor|regimului)|arme albe|braconaj|pescuit|taiere ilegala/;
const PROCEDURAL_PENAL_RE =
  /camera preliminara|masur|arestare|control judiciar|reabilitare|contestatie|plangere|liberare|confirmare|desfiintare inscrisuri|revizuire|contopire|inlocuire|amanare(a)? executar|intrerupere(a)? executar|sechestru|comisie rogatorie|recunoastere hotarare/;

export const CASE_KIND_LABEL: Record<CaseKind, string> = {
  insolventa: tr("Insolvență / faliment"),
  penal_economic: tr("Penal – infracțiune economică"),
  penal_grav: tr("Penal – infracțiune gravă"),
  penal_usor: tr("Penal – infracțiune ușoară"),
  penal_procedural: tr("Penal – procedură conexă"),
  contraventie: tr("Contravenție (amendă)"),
  executare: tr("Executare silită"),
  civil_comercial: "Litigiu civil / comercial",
  fiscal: "Litigiu fiscal (ANAF / taxe)",
  munca: tr("Litigiu de muncă / asigurări sociale"),
  familie_patrimoniu: "Familie / patrimoniu personal",
  altele: tr("Alt tip de dosar"),
};

const isPenalKind = (k: CaseKind) => k.startsWith("penal");

export function classifyCaseKind(obiect: string, categorie: string): CaseKind {
  const o = normalizeRo(obiect);
  const c = normalizeRo(categorie);
  const h = `${o} | ${c}`;
  if (/contraven|proces[ -]?verbal|\bp\.? ?v\.?\b|\bpr\.? ?v|transformare amenda/.test(h)) return "contraventie";
  if (/insolven|faliment|85\/2014|85\/2006|atragere(a)? raspunder/.test(h)) return "insolventa";
  if (c.includes("penal") || /\bncp\b|\bncpp\b|c\.? ?p\.|cod(ul)? penal|infractiun/.test(o)) {
    if (ECONOMIC_RE.test(o)) return "penal_economic";
    if (LIGHT_PENAL_RE.test(o)) return "penal_usor";
    if (PROCEDURAL_PENAL_RE.test(o)) return "penal_procedural";
    return "penal_grav";
  }
  // \b keeps "neexecutarea hotărârii" out of enforcement.
  if (/\bexecutar|poprire|somatie/.test(o)) return "executare";
  // Only the obiect: the category name itself is "Contencios administrativ şi fiscal".
  if (/fiscal|anaf|impunere|impozit|\btva\b|accesori|creant(a|e) bugetar/.test(o)) return "fiscal";
  if (c.includes("munca") || c.includes("asigurari sociale")) return "munca";
  if (
    c.includes("familie") ||
    /divort|partaj|succesiun|mostenir|uzucapiun|servitute|revendicar|granituir|indiviziune|intretinere|custodi|autoritat(ea|ii) parintest|ordin de protectie|tutel|nume|stare civila|carte funciara|intabular/.test(o)
  )
    return "familie_patrimoniu";
  if (c.includes("contencios")) return "altele";
  if (c.includes("civil") || c.includes("profesionist") || /pretenti|ordonanta de plata|valoare redusa|contract|despagubir|obligatie de a face/.test(o))
    return "civil_comercial";
  return "altele";
}

/** Role category with case-type context (e.g. "Petent" in a fine appeal is the fined person). */
function roleCategoryFor(kind: CaseKind, roles: string[], obiect: string): PartyRoleCategory {
  const o = normalizeRo(obiect);
  const cats = roles.map((r) => {
    const n = normalizeRo(r);
    if (kind === "contraventie" && /petent|contestator|reclamant/.test(n)) return "vizat";
    // Converting an unpaid fine: the authority files, the fined person is "Intimat".
    if (kind === "contraventie" && /transformare/.test(o) && /intimat/.test(n)) return "vizat";
    if (/reabilitare/.test(o) && /petent|condamnat/.test(n)) return "vizat";
    if (kind === "executare" && /contestator/.test(n)) return "vizat";
    if (kind === "fiscal" && /petent|contestator|reclamant/.test(n)) return "vizat";
    if (isPenalKind(kind) && /petent/.test(n) && !/condamnat|inculpat/.test(n)) return "necunoscut";
    return classifyPartyRole(r);
  });
  if (cats.includes("vizat")) return "vizat";
  if (cats.length > 0 && cats.every((c) => c === "nevizat")) return "nevizat";
  return "necunoscut";
}

/** Did the searched party file the request judged at this stage (claimant / appellant)? */
function isFiler(roles: string[]) {
  return roles.some((r) => /^(apelant|recurent|reclamant|petent|contestator|revizuent|creditor)/.test(normalizeRo(r).trim()));
}

// ---- Verdict ---------------------------------------------------------------

/** Lowercase/diacritic fold that remembers where each folded char came from. */
function foldWithMap(s: string) {
  let out = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    for (const ch of normalizeRo(s[i])) {
      out += ch;
      map.push(i);
    }
  }
  return { out, map };
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Position of the searched name inside a ruling (any word order; the portal sometimes has "?" for ș/ț). */
function findNameInText(folded: string, searched: string) {
  const tokens = normalizeRo(searched).split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return -1;
  const tok = (t: string) => t.replace(/[^a-z0-9]/g, "").replace(/[aist]/g, (ch) => `[${ch}?]`);
  let best = -1;
  for (const p of permutations(tokens)) {
    const m = new RegExp(`\\b${p.map(tok).join("[\\s\\-]+")}\\b`).exec(folded);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

const NON_DECISION_SOL = /^(amana|amanat|termen|repus|incheiere|suspendat|stare de urgenta|alte|rezolvat|$)/;
const DECISION_DOC = /hotarare(?!intermediara)|hotararecamera|incheierefinala/;

function pickDecision(hearings: CourtHearing[], today: string) {
  const sorted = [...hearings].sort((a, b) => b.data.localeCompare(a.data));
  const past = sorted.filter((h) => h.data.slice(0, 10) <= today);
  const future = sorted.filter((h) => h.data.slice(0, 10) > today);
  const decisions = past.filter((h) => {
    const sol = normalizeRo(h.solutie).trim();
    const doc = normalizeRo(h.documentSedinta);
    if (/indreptare|abtinere|recuzare/.test(doc)) return false;
    return DECISION_DOC.test(doc) || !NON_DECISION_SOL.test(sol);
  });
  return { decisions, nextHearing: future.length ? future[future.length - 1].data.slice(0, 10) : "" };
}

/** First decision verb of a ruling: "Admite...", "Respinge...", "Condamnă..." */
function leadingVerb(w: string) {
  const m =
    /\b(admite|admis|respinge|respins|nefondat|anuleaza|ia act|constata perimat|perim|declina|inceteaza|condamna|achita|claseaza|renunta|aproba|deschide|dispune|inchide)/.exec(
      w,
    );
  return m ? m[1] : "";
}

interface VerdictRead {
  outcome: CaseOutcome;
  label: string;
  isFinal: boolean | null;
  excerpt: string;
  date: string;
  nameFound: boolean;
}

function readVerdict(kind: CaseKind, obiect: string, roles: string[], hearings: CourtHearing[], searchedName: string, stadiu: string, today: string): VerdictRead & { nextHearing: string } {
  const { decisions, nextHearing } = pickDecision(hearings, today);
  const o = normalizeRo(obiect);
  // An appeal that is just "Respinge apelul" keeps the first-instance ruling: read substance from there.
  let decision = decisions[0];
  for (const d of decisions) {
    const txt = normalizeRo(`${d.solutie} ${d.solutieSumar}`);
    const onlyRejectsAppeal = /respinge.{0,40}(apel|recurs|contestati)/.test(txt) && !/condamn|achit|inceta|renunta|clasa/.test(txt);
    if (!onlyRejectsAppeal || d === decisions[decisions.length - 1]) {
      decision = d;
      break;
    }
  }
  if (!decision) {
    if (hearings.length === 0) {
      return { outcome: "necunoscut", label: tr("Portalul nu are ședințe publicate pentru acest dosar – soluție necunoscută"), isFinal: null, excerpt: "", date: "", nameFound: false, nextHearing };
    }
    return { outcome: "in_curs", label: nextHearing ? tr("În curs – următorul termen {a}", { a: nextHearing }) : tr("În curs – fără soluție pe fond"), isFinal: null, excerpt: "", date: "", nameFound: false, nextHearing };
  }

  const raw = decision.solutieSumar || decision.solutie;
  const { out: folded, map } = foldWithMap(raw);
  const pos = findNameInText(folded, searchedName);
  const nameFound = pos >= 0;
  const start = nameFound ? Math.max(0, pos - 220) : 0;
  const end = nameFound ? Math.min(folded.length, pos + 260) : Math.min(folded.length, 420);
  // Text around the name decides (whole ruling if the name is abbreviated, e.g. "SM");
  // the short "solutie" field is a fallback signal.
  const w = `${nameFound ? folded.slice(start, end) : folded} || ${normalizeRo(decision.solutie)}`;
  /** Original-text slice (with diacritics) of a regex match found in the folded window. */
  const original = (re: RegExp) => {
    const m = re.exec(folded);
    if (!m) return undefined;
    const from = map[m.index] ?? 0;
    const to = (map[m.index + m[0].length - 1] ?? raw.length - 1) + 1;
    return raw.slice(from, to).replace(/\s+/g, " ").trim();
  };
  const solField = normalizeRo(decision.solutie);
  const excerpt =
    folded.length === 0
      ? decision.solutie
      : `${start > 0 ? "…" : ""}${raw.slice(map[start] ?? 0, (map[end - 1] ?? raw.length - 1) + 1).replace(/\s+/g, " ").trim()}${end < folded.length ? "…" : ""}`;

  const all = normalizeRo(`${decision.solutie} ${decision.solutieSumar}`);
  const isFinal = /nedefinitiv/.test(all)
    ? false
    : /definitiv|fara cale de atac/.test(all)
      ? true
      : /cu (drept de )?(apel|recurs|contestatie)|calea de atac/.test(all)
        ? false
        : /apel|recurs/.test(normalizeRo(stadiu))
          ? true
          : null;
  const date = decision.data.slice(0, 10);
  const base = { isFinal, excerpt, date, nameFound };
  const verb = leadingVerb(w);
  const won = (filerWon: boolean) => (isFiler(roles) ? filerWon : !filerWon);

  // "Admite excepţia necompetenţei... declină competenţa" starts with "admite" but only moves the case.
  if (/declin/.test(solField) || (/declin\w* competent/.test(w) && !/condamn|achit|inceteaza procesul/.test(w))) {
    return { ...base, isFinal: null, nextHearing, outcome: "in_curs", label: tr("Dosar trimis la altă instanță (declinare de competență) – în curs") };
  }

  if (isPenalKind(kind)) {
    if (/reabilitare/.test(o)) {
      return { ...base, nextHearing, ...(/admite/.test(w) ? { outcome: "castigat", label: tr("Reabilitare admisă – antecedentele se consideră șterse") } : { outcome: "necunoscut", label: tr("Cerere de reabilitare (condamnare anterioară)") }) };
    }
    if (/clasare|neurmarire|netrimitere/.test(o)) {
      if (/respinge/.test(w)) return { ...base, nextHearing, outcome: "clasat", label: tr("Clasare menținută – plângerea împotriva clasării a fost respinsă") };
      if (/admite/.test(w)) return { ...base, nextHearing, outcome: "in_curs", label: tr("Clasarea a fost desființată – cercetarea continuă") };
    }
    if (/renuntar\w* (la )?urmari/.test(o)) {
      if (/admite|confirma/.test(w)) return { ...base, nextHearing, outcome: "vinovat_fara_pedeapsa", label: tr("Renunțare la urmărire penală confirmată (fapta reținută, fără proces)") };
      if (/respinge|infirma/.test(w)) return { ...base, nextHearing, outcome: "in_curs", label: tr("Renunțarea la urmărire a fost infirmată – dosarul continuă") };
    }
    if (/achit/.test(w)) return { ...base, nextHearing, outcome: "achitat", label: tr("Achitat – instanța a constatat nevinovăția") };
    if (/clasa/.test(w)) return { ...base, nextHearing, outcome: "clasat", label: tr("Clasat – fără trimitere în judecată") };
    if (/renunt\w* la aplicarea pedepsei|renuntarea la aplicarea/.test(w))
      return { ...base, nextHearing, outcome: "vinovat_fara_pedeapsa", label: tr("Renunțare la aplicarea pedepsei (vinovăție reținută, fără pedeapsă)") };
    if (/aman\w* aplicarea pedepsei|amanarea aplicarii|amana aplicarea/.test(w))
      return { ...base, nextHearing, outcome: "vinovat_fara_pedeapsa", label: tr("Amânarea aplicării pedepsei (vinovăție reținută, fără antecedente dacă respectă termenul)") };
    if (/inceta\w* procesul|incetarea procesului|incetat procesul/.test(w)) {
      const why = /impac/.test(w)
        ? tr("împăcarea părților")
        : /retrager/.test(w)
          ? tr("retragerea plângerii")
          : /amnisti/.test(w)
            ? "amnistie"
            : /deces/.test(w)
              ? "deces"
              : /prescri|16 alin\.? ?\(?1\)? lit\.? ?f|154 alin/.test(w)
                ? tr("prescripția răspunderii penale")
                : "motiv procedural";
      return { ...base, nextHearing, outcome: "incetat", label: tr("Proces penal încetat – {a} (fără verdict de vinovăție)", { a: why }) };
    }
    if (/condamn|stabileste pedeapsa|aplica pedeapsa|pedeapsa (de|amenzii|rezultanta)/.test(w)) {
      const prison = original(/\d[^.;,]{0,38}?inchisoare/);
      const fine = /amenzii penale|zile-amenda/.test(w);
      const suspended = /suspendar\w* (sub supraveghere|executarii|conditionat)/.test(w);
      const detail = fine ? "amendă penală" : prison ? `${prison}${suspended ? " cu suspendare" : ""}` : suspended ? "pedeapsă cu suspendare" : tr("pedeapsă aplicată");
      return { ...base, nextHearing, outcome: "condamnat", label: `Condamnat – ${detail}` };
    }
    if (/admis apel|admite apelul|admis recurs|admite recursul/.test(w)) {
      return { ...base, nextHearing, outcome: "necunoscut", label: tr("Apel admis – soluția de fond a fost modificată, iar noua soluție nu a putut fi citită din extras") };
    }
    return { ...base, nextHearing, outcome: nextHearing ? "in_curs" : "necunoscut", label: nextHearing ? tr("În curs – următorul termen {a}", { a: nextHearing }) : tr("Soluție: {a}", { a: decision.solutie || "neclară" }) };
  }

  if (kind === "contraventie" && /transformare/.test(o)) {
    if (/^admi/.test(verb) || /inlocuir|munca in folosul/.test(w)) {
      return { ...base, nextHearing, outcome: "sanctiune_mentinuta", label: tr("Amendă neplătită – instanța a înlocuit-o cu muncă în folosul comunității") };
    }
    if (/respin|nefondat|anuleaza|ia act|perim/.test(verb)) {
      return { ...base, nextHearing, outcome: "inchis_fara_fond", label: tr("Cererea de transformare a amenzii a fost respinsă / închisă") };
    }
  }

  if (kind === "contraventie") {
    if (/avertisment/.test(w) && /admite|inlocuieste|aplica/.test(w)) return { ...base, nextHearing, outcome: "avertisment", label: tr("Amenda înlocuită cu avertisment") };
    const annulsFine = /^admi/.test(verb) || (/^anuleaza/.test(verb) && /anuleaza (procesul|pv|actul)/.test(w));
    if (annulsFine) {
      return { ...base, nextHearing, outcome: "sanctiune_anulata", label: /in parte/.test(w) ? "Plângere admisă în parte – sancțiune redusă" : "Amendă anulată – plângerea a fost admisă" };
    }
    if (/respin|nefondat/.test(verb)) return { ...base, nextHearing, outcome: "sanctiune_mentinuta", label: tr("Amendă menținută – plângerea a fost respinsă") };
    if (/anuleaza|perim|ia act|renunta/.test(verb)) return { ...base, nextHearing, outcome: "sanctiune_mentinuta", label: tr("Plângerea nu a fost judecată pe fond – amenda rămâne") };
    return { ...base, nextHearing, outcome: "necunoscut", label: tr("Soluție: {a}", { a: decision.solutie || "neclară" }) };
  }

  if (/ia act|perim|renunta/.test(verb) || /^anuleaza/.test(verb))
    return { ...base, nextHearing, outcome: "inchis_fara_fond", label: tr("Închis fără judecată pe fond (renunțare / perimare / anulare)") };
  if (/tranzact|expedient/.test(w)) return { ...base, nextHearing, outcome: "inchis_fara_fond", label: tr("Închis prin tranzacție (înțelegere între părți)") };

  if (/^admi|aproba|deschide|dispune/.test(verb)) {
    const ok = won(true);
    return { ...base, nextHearing, outcome: ok ? "castigat" : "pierdut", label: ok ? "Câștigat – cererea părții căutate a fost admisă" : "Pierdut – cererea împotriva părții căutate a fost admisă" };
  }
  if (/respin|nefondat/.test(verb)) {
    const ok = won(false);
    return { ...base, nextHearing, outcome: ok ? "castigat" : "pierdut", label: ok ? "Câștigat – cererea împotriva părții căutate a fost respinsă" : "Pierdut – cererea părții căutate a fost respinsă" };
  }
  if (/inchide/.test(verb) && kind === "insolventa") return { ...base, nextHearing, outcome: "pierdut", label: tr("Procedură de insolvență închisă (a avut loc)") };
  return { ...base, nextHearing, outcome: nextHearing ? "in_curs" : "necunoscut", label: nextHearing ? tr("În curs – următorul termen {a}", { a: nextHearing }) : tr("Soluție: {a}", { a: decision.solutie || "neclară" }) };
}

// ---- Severity & deduction --------------------------------------------------

export const SEVERITY_LABEL: Record<SeverityLevel, string> = {
  0: tr("Fără impact"),
  1: "Minor",
  2: "Moderat",
  3: "Grav",
  4: "Critic",
};

/** Points subtracted from the 100-point legal score per level (4 = kill-switch). */
export const SEVERITY_DEDUCTION: Record<SeverityLevel, number> = { 0: 0, 1: 3, 2: 8, 3: 20, 4: 100 };
/** Many small fines must not sink the score: level-1 deductions are capped. */
export const MINOR_DEDUCTION_CAP = 9;
/** Rulings older than this (years) count half — banks look mainly at the last 5 years. */
export const OLD_CASE_YEARS = 5;

const clampLevel = (n: number) => Math.max(0, Math.min(4, n)) as SeverityLevel;

const KIND_WHY: Record<CaseKind, string> = {
  insolventa: tr("insolvența firmei înseamnă că nu și-a putut plăti datoriile – cel mai puternic semnal negativ pentru o bancă"),
  penal_economic: tr("infracțiunile economice (evaziune, înșelăciune, fals, delapidare, mită) privesc direct integritatea în afaceri"),
  penal_grav: tr("infracțiune de drept comun gravă (violență, furt, droguri) – risc reputațional și de continuitate a conducerii"),
  penal_usor: tr("infracțiune cu pericol redus (ex. rutieră, ordine publică) – fără legătură directă cu afacerea"),
  penal_procedural: tr("cerere/măsură dintr-un dosar penal; infracțiunea de bază nu e precizată în obiect"),
  contraventie: tr("contravenție (amendă) – faptă administrativă, nu infracțiune; nu creează antecedente penale"),
  executare: tr("executarea silită arată o datorie neplătită la scadență, deja stabilită printr-un titlu"),
  civil_comercial: tr("litigiu comercial/civil – poate indica datorii contestate față de parteneri"),
  fiscal: tr("dispută cu fiscul – semnal de obligații fiscale contestate sau restante"),
  munca: tr("litigiu de muncă / asigurări – impact redus asupra capacității de rambursare"),
  familie_patrimoniu: tr("chestiune personală sau patrimonială (succesiune, partaj, divorț) – nu privește afacerea"),
  altele: tr("dosar fără încadrare clară – tratat cu impact minor"),
};

function baseLevel(kind: CaseKind, obiect: string): SeverityLevel {
  const o = normalizeRo(obiect);
  switch (kind) {
    case "insolventa":
    case "penal_economic":
      return 4;
    case "penal_grav":
    case "executare":
      return 3;
    case "penal_usor":
    case "penal_procedural":
    case "civil_comercial":
    case "fiscal":
      return 2;
    case "contraventie":
    case "munca":
    case "altele":
      return 1;
    case "familie_patrimoniu":
      return /intretinere|ordin de protectie/.test(o) ? 1 : 0;
  }
}

function levelFor(kind: CaseKind, base: SeverityLevel, outcome: CaseOutcome, obiect: string): { level: SeverityLevel; why: string } {
  const o = normalizeRo(obiect);
  if (/reabilitare/.test(o)) {
    return outcome === "castigat"
      ? { level: 0, why: tr("reabilitarea șterge efectele condamnării anterioare") }
      : { level: 1, why: tr("cererea de reabilitare arată o condamnare mai veche, deja executată") };
  }
  if (kind === "contraventie" && /transformare/.test(o) && outcome === "sanctiune_mentinuta") {
    return { level: 2, why: tr("amenda nu a fost plătită nici după ce a devenit executorie – semnal de disciplină de plată slabă") };
  }
  if (isPenalKind(kind)) {
    switch (outcome) {
      case "achitat":
      case "clasat":
        return { level: 0, why: tr("nu există vinovăție reținută – dosarul nu se penalizează") };
      case "castigat":
        return { level: 0, why: tr("reabilitarea șterge efectele condamnării anterioare") };
      case "incetat":
        return { level: clampLevel(Math.max(1, base - 1)), why: tr("procesul s-a oprit fără condamnare, dar fapta a fost cercetată – un nivel sub cel de bază") };
      case "vinovat_fara_pedeapsa":
        return kind === "penal_economic"
          ? { level: 4, why: tr("vinovăția pentru o faptă economică a fost reținută, chiar dacă fără pedeapsă") }
          : { level: clampLevel(Math.max(1, base - 1)), why: tr("vinovăție reținută, dar fără pedeapsă executată – un nivel sub cel de bază") };
      case "condamnat":
        return kind === "penal_usor" || kind === "penal_procedural"
          ? { level: 3, why: tr("condamnare definitivă sau în primă instanță – urcă un nivel") }
          : { level: base, why: tr("condamnare pentru o faptă din această categorie") };
      case "in_curs":
        return { level: base, why: tr("dosar în desfășurare: se aplică prezumția de nevinovăție, dar banca va trata riscul ca activ") };
      default:
        return { level: base, why: tr("soluția nu a putut fi citită clar – se aplică nivelul de bază (conservator)") };
    }
  }
  switch (outcome) {
    case "castigat":
      if (kind === "insolventa") return { level: 1, why: tr("cererea de insolvență a fost respinsă, dar arată o restanță reclamată de un creditor") };
      if (kind === "executare") return { level: 1, why: tr("contestația la executare a fost câștigată, dar a existat o executare pornită") };
      return { level: 0, why: tr("partea căutată a câștigat – nu se penalizează") };
    case "sanctiune_anulata":
      return { level: 0, why: tr("amenda a fost anulată de instanță – nu se penalizează") };
    case "inchis_fara_fond":
      return { level: 0, why: tr("dosarul s-a închis fără o hotărâre împotriva părții căutate") };
    case "pierdut":
      return { level: base, why: tr("hotărâre în defavoarea părții căutate") };
    case "sanctiune_mentinuta":
    case "avertisment":
      return { level: 1, why: outcome === "avertisment" ? "doar avertisment, fără sumă de plată" : "amenda a rămas, dar este o sancțiune administrativă minoră" };
    case "in_curs":
      return kind === "insolventa" || kind === "executare"
        ? { level: base, why: tr("procedură deschisă / în desfășurare împotriva părții căutate") }
        : { level: clampLevel(Math.max(base === 0 ? 0 : 1, base - 1)), why: tr("litigiu nesoluționat – un nivel sub cel de bază până la hotărâre") };
    default:
      return { level: base, why: tr("soluția nu a putut fi citită clar – se aplică nivelul de bază (conservator)") };
  }
}

export interface CaseAnalysisInput {
  obiect: string;
  categorie: string;
  stadiu: string;
  partyRoles: string[];
  hearings: CourtHearing[];
  searchedName: string;
  /** ISO date used as "today" (tests). */
  today?: string;
}

export function analyzeCase(input: CaseAnalysisInput) {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const kind = classifyCaseKind(input.obiect, input.categorie);
  const roleCategory = roleCategoryFor(kind, input.partyRoles, input.obiect);
  const verdict = readVerdict(kind, input.obiect, input.partyRoles, input.hearings, input.searchedName, input.stadiu, today);
  const base = baseLevel(kind, input.obiect);

  const reasons: string[] = [];
  reasons.push(tr("Tip: {a} – {b}. Nivel de bază: {c} ({d}).", { a: CASE_KIND_LABEL[kind], b: KIND_WHY[kind], c: base, d: SEVERITY_LABEL[base] }));

  const roles = input.partyRoles.join(" / ") || "necunoscut";
  let level: SeverityLevel;
  if (roleCategory === "nevizat") {
    level = 0;
    reasons.push(tr("Rol: {a} – partea căutată este de cealaltă parte (creditor, reclamant, victimă), deci dosarul nu este îndreptat împotriva ei.", { a: roles }));
  } else {
    // Third parties (Intervenient, Intimat...) in ordinary lawsuits weigh one level less;
    // in penal / insolvency cases an unclear role stays at full weight (conservative).
    const softenUnknown = roleCategory === "necunoscut" && !isPenalKind(kind) && kind !== "insolventa";
    reasons.push(
      roleCategory === "vizat"
        ? tr("Rol: {a} – dosarul este îndreptat împotriva părții căutate.", { a: roles })
        : softenUnknown
          ? tr("Rol: {a} – parte terță sau rol ambiguu într-un litigiu obișnuit; se scade un nivel.", { a: roles })
          : tr("Rol: {a} – rol ambiguu; tratat conservator, ca și cum dosarul ar fi împotriva părții căutate.", { a: roles }),
    );
    const lv = levelFor(kind, base, verdict.outcome, input.obiect);
    level = softenUnknown ? clampLevel(lv.level - 1) : lv.level;
    reasons.push(`Soluție: ${verdict.label}${verdict.date ? ` (${verdict.date})` : ""} – ${lv.why}.`);
    if (verdict.date && !verdict.nameFound && verdict.excerpt) {
      reasons.push(tr("Atenție: hotărârea nu menționează nominal partea căutată; s-a folosit soluția generală a dosarului."));
    }
  }

  let deduction = SEVERITY_DEDUCTION[level];
  const resolved = verdict.outcome !== "in_curs" && verdict.date;
  const ageYears = resolved ? (Date.parse(today) - Date.parse(verdict.date)) / (365.25 * 864e5) : 0;
  if (level > 0 && level < 4 && ageYears > OLD_CASE_YEARS) {
    deduction = Math.round(deduction / 2);
    reasons.push(tr("Soluție mai veche de {a} ani ({b} ani) – penalizarea se înjumătățește.", { a: OLD_CASE_YEARS, b: Math.floor(ageYears) }));
  }
  reasons.push(
    level === 4
      ? tr("Nivel {a} – {b}: scorul legal devine 0 și se afișează alerta roșie de integritate.", { a: level, b: SEVERITY_LABEL[level] })
      : level === 0
        ? tr("Nivel 0 – {a}: 0 puncte scăzute.", { a: SEVERITY_LABEL[0] })
        : tr("Nivel {a} – {b}: -{c} puncte din scorul legal de 100.", { a: level, b: SEVERITY_LABEL[level], c: deduction }),
  );

  return {
    kind,
    kindLabel: CASE_KIND_LABEL[kind],
    roleCategory,
    outcome: verdict.outcome,
    outcomeLabel: verdict.label,
    isFinal: verdict.isFinal,
    decisionDate: verdict.date,
    nextHearing: verdict.nextHearing,
    verdictExcerpt: verdict.excerpt,
    severity: level,
    severityLabel: SEVERITY_LABEL[level],
    deduction,
    reasons,
    isCritical: level === 4,
  };
}

export function scoreLegalCases(cases: Pick<CourtCase, "severity" | "deduction">[]) {
  const criticalCount = cases.filter((c) => c.severity === 4).length;
  const minor = cases.filter((c) => c.severity === 1).reduce((s, c) => s + c.deduction, 0);
  const other = cases.filter((c) => c.severity === 2 || c.severity === 3).reduce((s, c) => s + c.deduction, 0);
  const minorCapApplied = minor > MINOR_DEDUCTION_CAP;
  const totalDeduction = Math.min(minor, MINOR_DEDUCTION_CAP) + other;
  if (criticalCount > 0) {
    return { legalScore: 0, integrityKillSwitch: true, criticalCount, totalDeduction: 100, minorCapApplied };
  }
  return { legalScore: Math.max(0, 100 - totalDeduction), integrityKillSwitch: false, criticalCount, totalDeduction, minorCapApplied };
}

/** Legal score from what actually counts per case (identity confidence + user confirmations). */
export function scoreLegalImpact(cases: ImpactCase[]) {
  return scoreLegalCases(cases.map(caseImpact));
}

/** Recomputes the score fields of a legal result (after the user confirms or disputes a case). */
export function rescoreLegal(r: LegalCheckResult): LegalCheckResult {
  const uncertainCount = r.cases.filter(needsConfirmation).length;
  if (r.isFallback) return { ...r, uncertainCount };
  const s = scoreLegalImpact(r.cases);
  return {
    ...r,
    criticalCount: s.criticalCount,
    totalDeduction: s.totalDeduction,
    minorCapApplied: s.minorCapApplied,
    legalScore: s.legalScore,
    integrityKillSwitch: s.integrityKillSwitch,
    uncertainCount,
  };
}

export const caseKey = (c: Pick<CourtCase, "numar" | "institutie">) => `${c.numar}|${c.institutie}`;

/**
 * A saved result from before identity confidence existed: its administrator cases count in full,
 * so a namesake's criminal case can still zero the score. Such results should be re-run.
 */
export function isPreIdentityLegal(r: Pick<LegalCheckResult, "cases"> | null | undefined) {
  return !!r?.cases?.some((c) => c.matchedBy === "administrator" && !c.confidence);
}

// ---------------------------------------------------------------------------
// Final score & Pillar 1 — S_Business: audited BCR formulas live in ./scoring.ts
// (bands and loan terms in ./bcr-formulas.ts). Re-exported here so existing imports keep working.
// ---------------------------------------------------------------------------

export { calculateFinalScore, computeBusinessScore, DSCR_NO_DEBT, statusForScore } from "./scoring.ts";
export { annuityInstallment as estimateInstallment, dscrScore, LOAN_ANNUAL_RATE, LOAN_MONTHS } from "./bcr-formulas.ts";

// ---------------------------------------------------------------------------
// Pillar 3b — Sector benchmark (0-100)
// ---------------------------------------------------------------------------

/**
 * Position vs. the sector distribution: best quartile → 100, median → 60,
 * worst quartile → 25, and 0 one inter-quartile distance beyond the worst quartile.
 */
export function quartileScore(value: number, [p25, median, p75]: [number, number, number], higherIsBetter: boolean) {
  // Normalise so that "lower is better" on an increasing axis.
  const best = higherIsBetter ? p75 : p25;
  const worst = higherIsBetter ? p25 : p75;
  const v = higherIsBetter ? -value : value;
  const b = higherIsBetter ? -best : best;
  const md = higherIsBetter ? -median : median;
  const w = higherIsBetter ? -worst : worst;
  return piecewise(v, [
    [b, 100],
    [md, 60],
    [w, 25],
    [w + (w - b), 0],
  ]);
}

export function computeBenchmark(m: BusinessMetrics, sector: SectorBenchmark): BenchmarkResult {
  const defs: { id: string; label: string; unit: string; company: number; range: [number, number, number]; higher: boolean }[] = [
    { id: "dso", label: "Termen mediu de încasare (DSO)", unit: "zile", company: m.dsoDays, range: sector.dsoDays, higher: false },
    { id: "concentration", label: "Concentrare client principal", unit: "%", company: m.topClientSharePct, range: sector.topClientSharePct, higher: false },
    { id: "storno", label: "Rată stornări (12 luni)", unit: "%", company: m.creditNotesSharePct12m, range: sector.creditNotesPct, higher: false },
    { id: "seasonality", label: "Sezonalitate (max/min)", unit: "×", company: m.seasonalityRatio, range: sector.seasonalityRatio, higher: false },
    { id: "margin", label: "Marjă brută comercială", unit: "%", company: m.grossMarginPct, range: sector.grossMarginPct, higher: true },
  ];
  const items: BenchmarkItem[] = defs.map((d) => {
    const score = round1(quartileScore(d.company, d.range, d.higher));
    const [p25, median, p75] = d.range;
    const better = d.higher ? d.company > median : d.company < median;
    const tolerance = Math.abs(median) * 0.05;
    return {
      id: d.id,
      label: d.label,
      unit: d.unit,
      company: d.company,
      p25,
      median,
      p75,
      higherIsBetter: d.higher,
      score,
      verdict: Math.abs(d.company - median) <= tolerance ? "la nivel" : better ? "mai bun" : "mai slab",
    };
  });
  return { sector, items, score: round1(items.reduce((s, i) => s + i.score, 0) / items.length) };
}
