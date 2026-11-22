/**
 * Credit Ready scoring (BCR Challenge 2) — the audited formulas.
 *
 *   ScorFinal   = 0.70·S_Business + 0.15·S_Uman + 0.15·S_Investiție       (clamped 0-100)
 *   Kill-switch : ScorQuiz ≤ 34 → ScorFinal − 10 (clamped 0-100) + red alert
 *   S_Uman      = 0.50·ScorQuiz + 0.50·ScorPortalJust
 *                 (or 0.50·ScorQuiz + 0.50·ScorVerificariExterne when the 6-source report is passed in)
 *   S_Investiție= 0.50·ScorFormularInvestiție + 0.50·ScorComparațieIndustrie
 *   S_Business  = 0.25·Stabilitate + 0.25·DSCR + 0.20·DSO/plăți + 0.15·Concentrare + 0.15·Reziliență extrasezon
 *
 * Pure functions (type-only imports + bcr-formulas + util) so `node --test` runs them directly
 * and the API routes recompute exactly the same score on the server.
 */
import type { BusinessMetrics, BusinessScore, Company, FinalScoreResult, ScoreStatus, SubScore } from "../types/scoring";
import {
  annuityInstallment,
  BUSINESS_WEIGHTS,
  concentrationScore,
  cvScore,
  dscrScore,
  FINAL_WEIGHTS,
  LOAN_ANNUAL_RATE,
  LOAN_MONTHS,
  paymentBehaviourScore,
  QUIZ_KILL_SWITCH_MAX,
  QUIZ_KILL_SWITCH_PENALTY,
  resilienceScore,
  STORNO_PENALTY,
  STORNO_PENALTY_THRESHOLD_PCT,
} from "./bcr-formulas.ts";
import { clamp, monthLabel, num, round1, round2, getNumberLocale } from "./util.ts";
import { tr } from "./i18n/tr.ts";

/** DSCR reported when the firm has no debt service at all (no existing loans, no new loan). */
export const DSCR_NO_DEBT = 99;

const ron = (n: number) => `${Math.round(n).toLocaleString(getNumberLocale())} RON`;

export function statusForScore(score: number): ScoreStatus {
  if (score >= 80) return "Bank-Ready";
  if (score >= 60) return "Pregătit cu rezerve";
  if (score >= 40) return "Necesită optimizare";
  return "Risc ridicat";
}

// ---------------------------------------------------------------------------
// Pillar 1 — S_Business (0-100), 70% of the final score
// ---------------------------------------------------------------------------

/** Average revenue and gross margin of the 3 weakest months of the 12-month window. */
export function weakMonths(m: BusinessMetrics, count = 3) {
  const weakest = [...m.months].sort((a, b) => a.revenue - b.revenue).slice(0, count);
  const avgRevenue = weakest.reduce((s, x) => s + x.revenue, 0) / Math.max(1, weakest.length);
  const avgPurchases = weakest.reduce((s, x) => s + x.purchases, 0) / Math.max(1, weakest.length);
  return { months: weakest.map((x) => x.month).sort(), avgRevenue, margin: avgRevenue - avgPurchases };
}

export function computeBusinessScore(m: BusinessMetrics, company: Company, requestedAmount: number | null, termMonths: number = LOAN_MONTHS): BusinessScore {
  // --- 2. Repayment capacity: annuity + DSCR on the TOTAL debt service --------------------
  const months = termMonths > 0 ? termMonths : LOAN_MONTHS;
  const loanInstallment = annuityInstallment(requestedAmount ?? 0, LOAN_ANNUAL_RATE, months);
  const debtService = company.existingMonthlyDebtService + loanInstallment;
  // EBITDA estimate = average monthly sales − purchases − fixed operating costs (metrics.operatingCashFlow).
  const dscr = debtService > 0 ? m.operatingCashFlow / debtService : DSCR_NO_DEBT;

  // --- 3. Payment behaviour: real DSO + storno penalty -------------------------------------
  const pay = paymentBehaviourScore(m.dsoDays, m.creditNotesSharePct3m);

  // --- 5. Off-season resilience -----------------------------------------------------------
  const weak = weakMonths(m);
  const obligations = company.monthlyFixedCosts + debtService;
  const resilienceRatio = obligations > 0 ? weak.margin / obligations : DSCR_NO_DEBT;

  const items: SubScore[] = [
    {
      id: "stability",
      label: tr("Stabilitatea încasărilor"),
      weight: BUSINESS_WEIGHTS.stability,
      score: cvScore(m.revenueCv),
      value: tr("CV = σ/μ = {cv} (volatilitate {v}% pe 12 luni)", { cv: num(m.revenueCv), v: num(m.revenueCv * 100) }),
      rule: tr("Coeficientul de variație al vânzărilor lunare (σ/μ). CV < 0,15 → 100 p · 0,15–0,30 → 75 p · 0,30–0,50 → 45 p · > 0,50 → 20 p."),
    },
    {
      id: "repayment",
      label: tr("Capacitatea de rambursare (DSCR)"),
      weight: BUSINESS_WEIGHTS.repayment,
      score: dscrScore(dscr),
      value:
        debtService > 0
          ? tr("DSCR {d}× = EBITDA {e} / rate {r} (existente {x} + nouă {n})", { d: num(round2(dscr)), e: ron(m.operatingCashFlow), r: ron(debtService), x: ron(company.existingMonthlyDebtService), n: ron(loanInstallment) })
          : tr("Fără rate existente și fără credit cerut: nu există serviciu al datoriei"),
      rule: tr("Rata nouă = anuitate R = P·r(1+r)^n / ((1+r)^n − 1) la {r}%/an, {m} luni. DSCR = EBITDA lunar estimat / (rate existente + rata nouă). ≥ 1,50 → 100 p · 1,25–1,49 → 80 p · 1,10–1,24 → 55 p · 1,00–1,09 → 30 p · < 1,00 → 0 p.", { r: LOAN_ANNUAL_RATE * 100, m: months }),
    },
    {
      id: "payments",
      label: tr("Comportamentul de plată (DSO)"),
      weight: BUSINESS_WEIGHTS.payments,
      score: pay.score,
      value: `${tr("DSO {d} zile (termen contractual {t} zile) · stornări 3 luni {s}%", { d: num(m.dsoDays), t: num(m.avgPaymentTermDays), s: num(m.creditNotesSharePct3m) })}${pay.penalty ? ` → −${STORNO_PENALTY} p` : ""}`,
      rule: tr("DSO = zile de la emitere la încasare, ponderat cu valoarea (fără date de încasare: DueDate − IssueDate). ≤ 15 → 100 p · 16–30 → 80 p · 31–45 → 55 p · 46–60 → 30 p · > 60 → 10 p. Stornări (381) > {t}% în ultimele 3 luni: −{p} p.", { t: STORNO_PENALTY_THRESHOLD_PCT, p: STORNO_PENALTY }),
    },
    {
      id: "concentration",
      label: tr("Concentrarea veniturilor"),
      weight: BUSINESS_WEIGHTS.concentration,
      score: concentrationScore(m.topClientSharePct),
      value: tr("clientul #1 ({c}) = {p}% din vânzări", { c: m.topClients[0]?.name ?? "—", p: num(m.topClientSharePct) }),
      rule: tr("Ponderea celui mai mare client în vânzările pe 12 luni. < 15% → 100 p · 15–30% → 80 p · 30–50% → 45 p · > 50% → 15 p."),
    },
    {
      id: "seasonality",
      label: tr("Sezonalitate & reziliență în luni slabe"),
      weight: BUSINESS_WEIGHTS.seasonality,
      score: resilienceScore(resilienceRatio),
      value: tr("luni slabe {m}: marjă {g}/lună vs. obligații {o}/lună = {r}×", { m: weak.months.map((x) => monthLabel(x, false)).join(", "), g: ron(weak.margin), o: ron(obligations), r: num(round2(resilienceRatio)) }),
      rule: tr("Marja brută medie din cele mai slabe 3 luni / (cheltuieli fixe + rate existente + rata nouă). ≥ 1,25× → 100 p · 1,10–1,24× → 80 p · 1,00–1,09× → 60 p · 0,85–0,99× → 35 p · < 0,85× → 10 p."),
    },
  ].map((i) => ({ ...i, score: round1(i.score) }) as SubScore);

  return {
    score: round1(items.reduce((s, i) => s + i.weight * i.score, 0)),
    items,
    loanInstallment: Math.round(loanInstallment),
    dscr: debtService > 0 ? round2(dscr) : DSCR_NO_DEBT,
    loan: { annualRatePct: LOAN_ANNUAL_RATE * 100, months },
    resilience: {
      weakMonths: weak.months,
      weakMonthsAvgRevenue: Math.round(weak.avgRevenue),
      weakMonthsMargin: Math.round(weak.margin),
      monthlyObligations: Math.round(obligations),
      ratio: obligations > 0 ? round2(resilienceRatio) : DSCR_NO_DEBT,
    },
    stornoPenaltyApplied: pay.penalty,
  };
}

// ---------------------------------------------------------------------------
// Final score (0-100)
// ---------------------------------------------------------------------------

/**
 * ScorFinal = 0.70·S_Business + 0.15·S_Uman + 0.15·S_Investiție, clamped to 0-100.
 * S_Uman = 0.5·Quiz + 0.5·PortalJust ; S_Investiție = 0.5·Formular + 0.5·Benchmark sector.
 * Kill-switch: Quiz ≤ 34 → −10 points from ScorFinal (still clamped to 0-100).
 */
export function calculateFinalScore(input: {
  sBusiness: number;
  quizScore: number;
  /** portal.just.ro score, or null when the portal did not answer (never a made-up neutral value). */
  legalScore: number | null;
  investmentFormScore: number;
  benchmarkScore: number;
  /** ScorVerificariExterne (0-100) from lib/multi-source-verifier.ts; replaces legalScore in S_Uman when given. */
  externalScore?: number | null;
}): FinalScoreResult {
  const { sBusiness, quizScore, legalScore, investmentFormScore, benchmarkScore } = input;
  const externalScore = typeof input.externalScore === "number" ? input.externalScore : null;
  const sUman = 0.5 * quizScore + 0.5 * (externalScore ?? legalScore ?? 0);
  const sInvestitie = 0.5 * investmentFormScore + 0.5 * benchmarkScore;
  const businessPoints = FINAL_WEIGHTS.business * sBusiness;
  const humanPoints = FINAL_WEIGHTS.human * sUman;
  const investmentPoints = FINAL_WEIGHTS.investment * sInvestitie;
  const rawScore = clamp(businessPoints + humanPoints + investmentPoints, 0, 100);

  const warnings: string[] = [];
  const quizKillSwitch = quizScore <= QUIZ_KILL_SWITCH_MAX;
  let score = rawScore;
  if (quizKillSwitch) {
    score = clamp(score - QUIZ_KILL_SWITCH_PENALTY, 0, 100);
    warnings.push(
      tr("Kill-switch de guvernanță: Quiz-ul financiar are {q}/100 (≤ {m}). Conducerea nu cunoaște indicatorii de bază ai firmei — se scad {p} puncte din scorul final.", { q: quizScore, m: QUIZ_KILL_SWITCH_MAX, p: QUIZ_KILL_SWITCH_PENALTY }),
    );
  }

  const finalScore = round1(score);
  return {
    finalScore,
    rawScore: round1(rawScore),
    status: statusForScore(finalScore),
    pillars: {
      business: { score: round1(sBusiness), points: round1(businessPoints), maxPoints: 70 },
      human: { score: round1(sUman), points: round1(humanPoints), maxPoints: 15, quizScore, legalScore, ...(externalScore !== null && { externalScore }) },
      investment: {
        score: round1(sInvestitie),
        points: round1(investmentPoints),
        maxPoints: 15,
        formScore: investmentFormScore,
        benchmarkScore: round1(benchmarkScore),
      },
    },
    quizKillSwitch,
    warnings,
  };
}
