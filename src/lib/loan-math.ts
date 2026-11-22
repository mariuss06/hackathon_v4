/**
 * Loan cost, repayment capacity, stress test and month-by-month seasonality — pure functions
 * on the firm's REAL numbers (metrics from e-Factura + declared costs / installments).
 *
 *   Annuity:  R = P · r(1+r)^n / ((1+r)^n − 1),  r = annual rate / 12, n = months
 *   DSCR   :  operating cash flow (EBITDA estimate) / total monthly debt service
 *   Safe installment: the largest new installment that keeps DSCR ≥ 1,25
 */
import type { BusinessMetrics, MonthPoint } from "../types/scoring";
import { annuityInstallment, principalForInstallment, LOAN_ANNUAL_RATE } from "./bcr-formulas.ts";
import { round2, getNumberLocale } from "./util.ts";
import { tr } from "./i18n/tr.ts";

/** Minimum DSCR covenant used by Romanian banks for SMEs. */
export const SAFE_DSCR = 1.25;

/** VAT rates that can apply to an investment in Romania (21% / 11% since 1 Aug 2025; 19% / 9% before). */
export const VAT_OPTIONS = [
  { rate: 0.21, label: "21% (standard din 1 aug. 2025)" },
  { rate: 0.19, label: "19% (standard până la 31 iul. 2025)" },
  { rate: 0.11, label: "11% (redusă din 1 aug. 2025)" },
  { rate: 0.09, label: "9% (redusă până la 31 iul. 2025)" },
  { rate: 0, label: "0% (scutit / taxare inversă)" },
] as const;

export interface LoanCostInput {
  /** Investment value WITHOUT VAT (RON). */
  netAmount: number;
  vatRate: number;
  /** Own contribution in % of the total WITH VAT. */
  ownContributionPct: number;
  annualRatePct: number;
  months: number;
  /** Banks usually finance the VAT too only for VAT non-payers; default false = bank finances the net value. */
  financeVat?: boolean;
}

export interface LoanCostBreakdown {
  netAmount: number;
  vat: number;
  totalWithVat: number;
  ownContribution: number;
  ownContributionPct: number;
  /** Principal actually lent by the bank. */
  financed: number;
  monthlyInstallment: number;
  avgPrincipalPerMonth: number;
  avgInterestPerMonth: number;
  firstMonthInterest: number;
  annualRatePct: number;
  totalInterest: number;
  totalRepaid: number;
  months: number;
}

export function loanCostBreakdown(x: LoanCostInput): LoanCostBreakdown {
  const net = Math.max(0, x.netAmount);
  const vat = round2(net * Math.max(0, x.vatRate));
  const totalWithVat = round2(net + vat);
  const ownPct = Math.max(0, Math.min(100, x.ownContributionPct));
  const ownContribution = round2((totalWithVat * ownPct) / 100);
  // The VAT is recovered from the state by VAT payers, so the bank finances (net − own contribution) unless financeVat.
  const base = x.financeVat ? totalWithVat : net;
  const financed = round2(Math.max(0, base - ownContribution));
  const months = Math.max(1, Math.round(x.months));
  const rate = Math.max(0, x.annualRatePct) / 100;
  const installment = annuityInstallment(financed, rate, months);
  const totalRepaid = installment * months;
  const totalInterest = Math.max(0, totalRepaid - financed);
  return {
    netAmount: net,
    vat,
    totalWithVat,
    ownContribution,
    ownContributionPct: ownPct,
    financed,
    monthlyInstallment: round2(installment),
    avgPrincipalPerMonth: round2(financed / months),
    avgInterestPerMonth: round2(totalInterest / months),
    firstMonthInterest: round2((financed * rate) / 12),
    annualRatePct: x.annualRatePct,
    totalInterest: round2(totalInterest),
    totalRepaid: round2(totalRepaid),
    months,
  };
}

// ---------------------------------------------------------------------------
// Repayment capacity
// ---------------------------------------------------------------------------

/** Largest NEW monthly installment that keeps DSCR ≥ `minDscr` (0 when the firm has no room). */
export function maxSafeInstallment(operatingCashFlow: number, existingDebtService: number, minDscr = SAFE_DSCR) {
  return Math.max(0, operatingCashFlow / minDscr - existingDebtService);
}

/** Largest principal that installment repays over `months` (rounded down to 1.000 RON). */
export function maxLoanAmount(installment: number, months: number, annualRate = LOAN_ANNUAL_RATE) {
  return Math.floor(principalForInstallment(installment, annualRate, months) / 1000) * 1000;
}

// ---------------------------------------------------------------------------
// Stress test: sales drop by X% (purchases follow sales, fixed costs and installments do not)
// ---------------------------------------------------------------------------

export interface StressResult {
  dropPct: number;
  /** Average month with sales −X%. */
  stressedCashFlow: number;
  stressedDscr: number | null;
  /** Weakest real month with sales −X%. */
  worstMonth: string;
  worstMonthCashFlow: number;
  worstMonthDscr: number | null;
  debtService: number;
  tone: "emerald" | "amber" | "red";
  verdict: string;
}

const dscrOf = (cash: number, debt: number) => (debt > 0 ? round2(cash / debt) : null);

export function stressTest(m: BusinessMetrics, fixedCosts: number, existingDebtService: number, newInstallment: number, dropPct: number): StressResult {
  const k = 1 - Math.max(0, Math.min(100, dropPct)) / 100;
  const debt = existingDebtService + newInstallment;
  const stressedCashFlow = (m.avgMonthlyRevenue - m.avgMonthlyPurchases) * k - fixedCosts;
  const weakest = [...m.months].sort((a, b) => a.revenue - b.revenue)[0];
  const worstMonthCashFlow = weakest ? (weakest.revenue - weakest.purchases) * k - fixedCosts : stressedCashFlow;
  const stressedDscr = dscrOf(stressedCashFlow, debt);
  const worstMonthDscr = dscrOf(worstMonthCashFlow, debt);
  const ref = stressedDscr ?? 99;
  const tone = ref >= SAFE_DSCR ? "emerald" : ref >= 1 ? "amber" : "red";
  const verdict =
    debt <= 0
      ? tr("Fără rate de plătit: scăderea vânzărilor afectează doar profitul.")
      : tone === "emerald"
        ? tr("Și cu vânzări −{d}%, firma acoperă rata de {x} ori — peste pragul băncilor (1,25).", { d: dropPct, x: ref.toLocaleString(getNumberLocale(), { maximumFractionDigits: 2 }) })
        : tone === "amber"
          ? tr("Cu vânzări −{d}%, rata se plătește, dar sub pragul de siguranță al băncilor (1,25): ai nevoie de o rezervă.", { d: dropPct })
          : tr("Cu vânzări −{d}%, încasările nu mai acoperă rata: în extrasezon ai nevoie de rezervă sau de o sumă mai mică.", { d: dropPct });
  return {
    dropPct,
    stressedCashFlow: round2(stressedCashFlow),
    stressedDscr,
    worstMonth: weakest?.month ?? "",
    worstMonthCashFlow: round2(worstMonthCashFlow),
    worstMonthDscr,
    debtService: round2(debt),
    tone,
    verdict,
  };
}

// ---------------------------------------------------------------------------
// Seasonality heatmap
// ---------------------------------------------------------------------------

export interface SeasonMonth {
  month: string; // YYYY-MM
  calendarMonth: number; // 1-12
  /** Cash left after purchases, fixed costs and existing installments, before the new installment. */
  available: number;
  /** available / new installment (null when there is no new installment). */
  coverage: number | null;
  tone: "emerald" | "amber" | "red";
  /** RON missing to pay the new installment that month (0 when covered). */
  shortfall: number;
}

export function seasonalityMap(months: MonthPoint[], newInstallment: number): { months: SeasonMonth[]; reserveNeeded: number; redMonths: SeasonMonth[] } {
  const rows: SeasonMonth[] = months.map((p) => {
    const available = p.netCashFlow;
    const coverage = newInstallment > 0 ? round2(available / newInstallment) : null;
    const tone: SeasonMonth["tone"] =
      newInstallment > 0 ? (available >= newInstallment * SAFE_DSCR ? "emerald" : available >= newInstallment ? "amber" : "red") : available > 0 ? "emerald" : "red";
    return {
      month: p.month,
      calendarMonth: Number(p.month.slice(5, 7)),
      available: round2(available),
      coverage,
      tone,
      shortfall: round2(Math.max(0, newInstallment - available)),
    };
  });
  const redMonths = rows.filter((r) => r.tone === "red");
  return { months: [...rows].sort((a, b) => a.calendarMonth - b.calendarMonth), reserveNeeded: round2(redMonths.reduce((s, r) => s + (newInstallment > 0 ? r.shortfall : -r.available), 0)), redMonths };
}

/** Cash released by collecting faster: receivables = annual revenue × DSO / 365. */
export const cashFreedByDso = (annualRevenue: number, dsoFrom: number, dsoTo: number) => Math.round((annualRevenue * (dsoFrom - dsoTo)) / 365);
