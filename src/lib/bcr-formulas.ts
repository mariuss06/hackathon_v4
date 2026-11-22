/**
 * BCR / Romanian SME underwriting formulas used by S_Business.
 * Pure functions, no imports besides util — every threshold below is shown in the UI
 * ("Cum calculăm scorul") so the score can be audited by hand.
 *
 * Sources of the conventions (public market practice in Romania, 2025-2026):
 *  - annuity installment, the usual repayment schedule for SME investment loans;
 *  - DSCR = operating cash flow / total debt service, minimum 1.20-1.25× in bank covenants;
 *  - DSO and client concentration, standard working-capital and credit-risk indicators;
 *  - indicative SME rate ~9.5-11% / year (ROBOR/IRCC + margin), maturities 36-60 months.
 */

// ---------------------------------------------------------------------------
// Indicative loan terms
// ---------------------------------------------------------------------------

/** Indicative SME interest rate in Romania: 9.5-11% / year. The engine uses the low end, the matcher shows the range. */
export const LOAN_RATE_RANGE_PCT: [number, number] = [9.5, 11];
export const LOAN_ANNUAL_RATE = 0.095;
/** Maturity range for SME investment loans (months); the estimate uses the upper end. */
export const LOAN_MATURITY_RANGE: [number, number] = [36, 60];
export const LOAN_MONTHS = 60;

/**
 * Standard annuity: R = P · r(1+r)^n / ((1+r)^n − 1), with r = annual rate / 12 and n = months.
 * Returns 0 for a missing / non-positive principal.
 */
export function annuityInstallment(principal: number, annualRate = LOAN_ANNUAL_RATE, months = LOAN_MONTHS) {
  if (!principal || principal <= 0 || months <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  const f = (1 + r) ** months;
  return (principal * r * f) / (f - 1);
}

/** Inverse annuity: the principal a given monthly installment can repay. */
export function principalForInstallment(installment: number, annualRate = LOAN_ANNUAL_RATE, months = LOAN_MONTHS) {
  if (!installment || installment <= 0 || months <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return installment * months;
  const f = (1 + r) ** months;
  return (installment * (f - 1)) / (r * f);
}

// ---------------------------------------------------------------------------
// Banded scores (step functions, exactly as in the BCR spec)
// ---------------------------------------------------------------------------

export interface Band {
  /** Upper (or lower, see `higherIsBetter`) bound of the band. */
  limit: number;
  points: number;
  label: string;
}

/** Stability of collections: coefficient of variation σ/μ of the 12 monthly revenues. */
export const CV_BANDS: Band[] = [
  { limit: 0.15, points: 100, label: "CV < 0,15" },
  { limit: 0.3, points: 75, label: "0,15–0,30" },
  { limit: 0.5, points: 45, label: "0,30–0,50" },
  { limit: Infinity, points: 20, label: "> 0,50" },
];

export function cvScore(cv: number) {
  if (!Number.isFinite(cv)) return 20;
  // CV < 0.15 is the top band; 0.15 itself already belongs to the second band.
  const v = Math.round(cv * 10_000) / 10_000;
  if (v < 0.15) return 100;
  if (v <= 0.3) return 75;
  if (v <= 0.5) return 45;
  return 20;
}

/** DSCR bands used by Romanian banks (BCR covenant ≈ 1.25×). */
export const DSCR_BANDS: Band[] = [
  { limit: 1.5, points: 100, label: "≥ 1,50" },
  { limit: 1.25, points: 80, label: "1,25–1,49" },
  { limit: 1.1, points: 55, label: "1,10–1,24" },
  { limit: 1.0, points: 30, label: "1,00–1,09" },
  { limit: -Infinity, points: 0, label: "< 1,00 (risc major)" },
];

export function dscrScore(dscr: number) {
  if (!Number.isFinite(dscr)) return 100;
  const v = Math.round(dscr * 100) / 100; // DSCR is read at 2 decimals, like in a credit memo
  if (v >= 1.5) return 100;
  if (v >= 1.25) return 80;
  if (v >= 1.1) return 55;
  if (v >= 1.0) return 30;
  return 0;
}

/** Days sales outstanding (real collection term, amount-weighted). */
export const DSO_BANDS: Band[] = [
  { limit: 15, points: 100, label: "≤ 15 zile" },
  { limit: 30, points: 80, label: "16–30 zile" },
  { limit: 45, points: 55, label: "31–45 zile" },
  { limit: 60, points: 30, label: "46–60 zile" },
  { limit: Infinity, points: 10, label: "> 60 zile" },
];

/** Storno (InvoiceTypeCode 381) share above which the DSO sub-score loses STORNO_PENALTY points. */
export const STORNO_PENALTY_THRESHOLD_PCT = 5;
export const STORNO_PENALTY = 15;

export function dsoBandScore(dsoDays: number) {
  const d = Math.round(dsoDays); // DSO is reported in whole days
  if (d <= 15) return 100;
  if (d <= 30) return 80;
  if (d <= 45) return 55;
  if (d <= 60) return 30;
  return 10;
}

/** DSO band, minus 15 points when storno exceeds 5% of the issued value (floored at 0). */
export function paymentBehaviourScore(dsoDays: number, stornoPct: number) {
  const base = dsoBandScore(dsoDays);
  const penalty = stornoPct > STORNO_PENALTY_THRESHOLD_PCT;
  return { score: Math.max(0, base - (penalty ? STORNO_PENALTY : 0)), base, penalty };
}

/** Revenue concentration: share of the biggest client in 12-month sales. */
export const CONCENTRATION_BANDS: Band[] = [
  { limit: 15, points: 100, label: "< 15%" },
  { limit: 30, points: 80, label: "15–30%" },
  { limit: 50, points: 45, label: "30–50%" },
  { limit: Infinity, points: 15, label: "> 50%" },
];

export function concentrationScore(topClientSharePct: number) {
  const v = Math.round(topClientSharePct * 10) / 10;
  if (v < 15) return 100;
  if (v <= 30) return 80;
  if (v <= 50) return 45;
  return 15;
}

/**
 * Off-season resilience = gross margin earned in the 3 weakest months / monthly obligations
 * (fixed costs + existing installments + the new installment). ≥ 1 means the firm can pay
 * everything, including the new loan, even in its worst months without touching reserves.
 */
export const RESILIENCE_BANDS: Band[] = [
  { limit: 1.25, points: 100, label: "≥ 1,25×" },
  { limit: 1.1, points: 80, label: "1,10–1,24×" },
  { limit: 1.0, points: 60, label: "1,00–1,09×" },
  { limit: 0.85, points: 35, label: "0,85–0,99×" },
  { limit: -Infinity, points: 10, label: "< 0,85×" },
];

export function resilienceScore(ratio: number) {
  if (!Number.isFinite(ratio)) return 100;
  const v = Math.round(ratio * 100) / 100;
  if (v >= 1.25) return 100;
  if (v >= 1.1) return 80;
  if (v >= 1.0) return 60;
  if (v >= 0.85) return 35;
  return 10;
}

// ---------------------------------------------------------------------------
// S_Business weights (sum = 1)
// ---------------------------------------------------------------------------

export const BUSINESS_WEIGHTS = {
  stability: 0.25,
  repayment: 0.25,
  payments: 0.2,
  concentration: 0.15,
  seasonality: 0.15,
} as const;

// ---------------------------------------------------------------------------
// Final formula weights & kill-switch
// ---------------------------------------------------------------------------

export const FINAL_WEIGHTS = { business: 0.7, human: 0.15, investment: 0.15 } as const;
/** Quiz ≤ 34 points: governance kill-switch, −10 points from ScorFinal (clamped 0-100). */
export const QUIZ_KILL_SWITCH_MAX = 34;
export const QUIZ_KILL_SWITCH_PENALTY = 10;
/** Below this ScorFinal a firm is not "Credit Ready" yet: follow the 30-90 day plan first. */
export const CREDIT_READY_MIN_SCORE = 60;
