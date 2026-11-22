/**
 * One entry point that turns raw inputs (invoices of the ACTIVE company, quiz answers,
 * investment form, legal check) into the full Credit Ready profile. Used by the UI on
 * every change and by the API routes, so the score is always computed the same way.
 *
 * Modules:
 *  metrics.ts      → indicators from the invoices
 *  scoring.ts      → S_Business + final formula (bands in bcr-formulas.ts)
 *  scoringEngine.ts→ quiz, investment form, sector benchmark, portal.just.ro
 *  action-plan.ts  → drivers + 30-90 day plan
 *  bank-matcher.ts → Romanian bank / product recommendations
 */
import type {
  ActionItem,
  BenchmarkResult,
  BusinessMetrics,
  BusinessScore,
  Company,
  FinalScoreResult,
  InvestmentEvaluation,
  InvestmentInput,
  Invoice,
  LegalCheckResult,
  QuizAnswers,
  QuizEvaluation,
  ScoreDriver,
} from "../types/scoring";
import { buildActionPlan, computeDrivers } from "./action-plan.ts";
import { matchBanks, type BankMatchResult } from "./bank-matcher.ts";
import { resolveSector } from "./data/benchmarks.ts";
import { computeMetrics } from "./metrics.ts";
import { calculateFinalScore, computeBusinessScore } from "./scoring.ts";
import { effectiveDebtService } from "./company.ts";
import { computeBenchmark, evaluateFinancialQuiz, evaluateInvestment, quizTruthFromMetrics } from "./scoringEngine.ts";
import type { MultiSourceVerificationReport } from "./multi-source-verifier.ts";
import { LOAN_MONTHS } from "./bcr-formulas.ts";
import { pct, getNumberLocale } from "./util.ts";
import { tr } from "./i18n/tr.ts";

export interface AssessmentInput {
  company: Company;
  /** Invoices of the active company only (callers filter by company_id). */
  invoices: Invoice[];
  quiz: QuizAnswers;
  investment: InvestmentInput;
  legal: LegalCheckResult | null;
  /**
   * Optional 5-real-source report (lib/multi-source-verifier.ts). When it has a score,
   * S_Uman = 0.5·Quiz + 0.5·ScorVerificariExterne instead of 0.5·Quiz + 0.5·ScorPortalJust.
   */
  verification?: MultiSourceVerificationReport | null;
  /** ISO date for the empty-invoice window (see computeMetrics); omitted on the server. */
  today?: string;
  /**
   * What-If only (components/WhatIfSimulator.tsx): replaces indicators (e.g. DSO, client concentration)
   * for S_Business, the sector benchmark and the bank matcher. The quiz is always checked against the REAL metrics.
   */
  metricsOverride?: Partial<Pick<BusinessMetrics, "dsoDays" | "topClientSharePct">>;
}

export interface Assessment {
  metrics: BusinessMetrics;
  business: BusinessScore;
  quiz: QuizEvaluation;
  investment: InvestmentEvaluation;
  benchmark: BenchmarkResult;
  /** How the benchmark sector was chosen: from the CAEN code, from the dropdown, or the General IMM default. */
  sectorSource: "caen" | "manual" | "default";
  /** portal.just.ro score; null when the portal has not answered (nothing is assumed). */
  legalScore: number | null;
  legalPending: boolean;
  /** Which real inputs exist; the final score is "complete" only when all of them do. */
  dataStatus: { hasInvoices: boolean; financialsDeclared: boolean; externalChecked: boolean; quizAnswered: boolean };
  final: FinalScoreResult;
  drivers: ScoreDriver[];
  plan: ActionItem[];
  banks: BankMatchResult;
}

export function computeAssessment(input: AssessmentInput): Assessment {
  // Existing installments: the CRC / Biroul de Credit lines when declared, otherwise the declared total.
  const company = { ...input.company, existingMonthlyDebtService: effectiveDebtService(input.company) };
  input = { ...input, company };
  const realMetrics = computeMetrics(input.invoices, company, input.today);
  const metrics: BusinessMetrics = input.metricsOverride ? { ...realMetrics, ...input.metricsOverride } : realMetrics;
  const business = computeBusinessScore(metrics, company, input.investment.requestedAmount, input.investment.termMonths ?? LOAN_MONTHS);
  const quiz = evaluateFinancialQuiz(input.quiz, quizTruthFromMetrics(realMetrics));
  const investment = evaluateInvestment(input.investment, metrics.annualizedRevenue);
  const { sector, source: sectorSource } = resolveSector(input.company);
  const benchmark = computeBenchmark(metrics, sector);
  const legalPending = !input.legal || input.legal.isFallback;
  const legalScore = legalPending ? null : input.legal!.legalScore;
  const externalScore = input.verification?.aggregateScore ?? null;
  const dataStatus = {
    hasInvoices: metrics.issuedCount > 0,
    financialsDeclared: Boolean(company.financialsDeclared),
    externalChecked: externalScore !== null || legalScore !== null,
    quizAnswered: quiz.answered === 5,
  };
  const missing = [
    !dataStatus.hasInvoices && tr("facturi e-Factura emise (UBL 2.1) pentru pilonul Business"),
    !dataStatus.financialsDeclared && tr("cheltuielile fixe lunare și ratele existente (declarate în Pasul 2)"),
    !dataStatus.externalChecked && tr("cel puțin o verificare externă reușită (CUI pentru ANAF sau portal.just.ro)"),
  ].filter(Boolean) as string[];

  const final = calculateFinalScore({
    sBusiness: business.score,
    quizScore: quiz.total,
    legalScore,
    investmentFormScore: investment.total,
    benchmarkScore: benchmark.score,
    externalScore,
  });
  final.complete = missing.length === 0;
  final.missing = missing;
  for (const d of company.debts ?? []) {
    if (d.daysLate > 90) final.warnings.push(tr("Restanță de {d} zile la {l} (raport CRC): majoritatea băncilor resping dosarul până la regularizare.", { d: d.daysLate, l: d.lender }));
    else if (d.daysLate > 30) final.warnings.push(tr("Întârziere de {d} zile la {l}: plătește restanța înainte de depunerea dosarului.", { d: d.daysLate, l: d.lender }));
  }
  for (const s of input.verification?.sources.filter((x) => x.status === "critical") ?? []) {
    final.warnings.push(`${tr(s.name)}: ${tr(s.summary)}`);
  }
  if (input.legal?.integrityKillSwitch) {
    final.warnings.push(tr("Alertă de integritate: portal.just.ro a returnat cel puțin un dosar critic (insolvență / infracțiune economică). Scorul legal este 0."));
  }
  if (investment.overLeveragedRequest) {
    final.warnings.push(tr("Alertă de supraîndatorare: suma cerută reprezintă {p} din cifra de afaceri anualizată (peste 50%).", { p: pct(investment.leverageRatio * 100) }));
  }
  if (business.dscr < 1) {
    final.warnings.push(tr("Risc major de nerambursare: DSCR {d}× — cash-flow-ul operațional nu acoperă ratele (existente + nouă).", { d: business.dscr.toLocaleString(getNumberLocale()) }));
  }

  const core = { metrics, business, quiz, investment, benchmark, sectorSource, legalScore, legalPending, dataStatus, final };
  const banks = matchBanks({
    finalScore: final.finalScore,
    operatingCashFlow: metrics.operatingCashFlow,
    existingMonthlyDebtService: company.existingMonthlyDebtService,
    purpose: input.investment.purpose,
    ownContributionPct: input.investment.ownContributionPct,
    requestedAmount: input.investment.requestedAmount,
    annualizedRevenue: metrics.annualizedRevenue,
    dsoDays: metrics.dsoDays,
    topClientSharePct: metrics.topClientSharePct,
    revenueCv: metrics.revenueCv,
    seasonalityRatio: metrics.seasonalityRatio,
    resilienceRatio: business.resilience.ratio,
    sector,
    legalScore: legalScore ?? 0,
    legalCritical: Boolean(input.legal?.integrityKillSwitch),
    legalPending,
  });
  return { ...core, drivers: computeDrivers(core, input), plan: buildActionPlan(core, input), banks };
}
