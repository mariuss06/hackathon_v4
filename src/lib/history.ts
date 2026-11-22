/**
 * Assessment history: one immutable snapshot per saved evaluation (table public.assessment_history),
 * and the "previous vs. current" comparison shown when a company comes back.
 * Pure module (type-only imports).
 */
import type { Assessment } from "./assessment.ts";
import type { InvestmentInput } from "../types/scoring";

export interface AssessmentSnapshot {
  id: string;
  companyId: string;
  userId?: string | null;
  finalScore: number;
  sBusiness: number;
  sUman: number;
  sInvestitie: number;
  /** null when the firm has no debt service (DSCR not applicable). */
  dscr: number | null;
  dso: number;
  clientConcentration: number;
  requestedAmount: number | null;
  status: string;
  createdAt: string;
  /** Extra context kept with the snapshot (installment, revenue, top bank...). */
  snapshot?: Record<string, unknown>;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Builds the snapshot of a COMPLETE assessment (callers never snapshot a score on missing data). */
export function snapshotFromAssessment(a: Assessment, companyId: string, investment: InvestmentInput, id: string, createdAt: string, userId?: string | null): AssessmentSnapshot {
  return {
    id,
    companyId,
    userId: userId ?? null,
    finalScore: r1(a.final.finalScore),
    sBusiness: r1(a.final.pillars.business.score),
    sUman: r1(a.final.pillars.human.score),
    sInvestitie: r1(a.final.pillars.investment.score),
    dscr: a.business.dscr >= 99 ? null : r2(a.business.dscr),
    dso: r1(a.metrics.dsoDays),
    clientConcentration: r1(a.metrics.topClientSharePct),
    requestedAmount: investment.requestedAmount,
    status: a.final.status,
    createdAt,
    snapshot: {
      loanInstallment: a.business.loanInstallment,
      annualizedRevenue: Math.round(a.metrics.annualizedRevenue),
      invoices: a.metrics.issuedCount + a.metrics.receivedCount,
      creditNotesPct3m: a.metrics.creditNotesSharePct3m,
      topBank: a.banks.top ? `${a.banks.top.bank} — ${a.banks.top.product}` : null,
      creditReady: a.banks.creditReady,
      ownContributionPct: investment.ownContributionPct,
      purpose: investment.purpose,
    },
  };
}

export interface HistoryDelta {
  label: string;
  from: string;
  to: string;
  /** Signed change in the metric's own unit. */
  change: number;
  /** true when the change is an improvement (DSO / concentration: lower is better). */
  better: boolean | null;
  text: string;
}

const fmt = (n: number, digits = 1) => n.toLocaleString("ro-RO", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** Previous vs. current, with the direction of "better" for each indicator. */
export function compareSnapshots(prev: AssessmentSnapshot, curr: AssessmentSnapshot): HistoryDelta[] {
  const row = (label: string, a: number | null, b: number | null, unit: string, lowerIsBetter = false, digits = 1): HistoryDelta | null => {
    if (a === null || b === null) return null;
    const change = b - a;
    const better = Math.abs(change) < 1e-9 ? null : lowerIsBetter ? change < 0 : change > 0;
    const sign = change > 0 ? "+" : "";
    return { label, from: `${fmt(a, digits)}${unit}`, to: `${fmt(b, digits)}${unit}`, change, better, text: `${sign}${fmt(change, digits)}${unit}` };
  };
  return [
    row("Scor final", prev.finalScore, curr.finalScore, " pct"),
    row("S_Business", prev.sBusiness, curr.sBusiness, " pct"),
    row("S_Uman", prev.sUman, curr.sUman, " pct"),
    row("S_Investiție", prev.sInvestitie, curr.sInvestitie, " pct"),
    row("DSCR", prev.dscr, curr.dscr, "×", false, 2),
    row("DSO", prev.dso, curr.dso, " zile", true, 0),
    row("Concentrare client #1", prev.clientConcentration, curr.clientConcentration, "%", true),
    row("Suma solicitată", prev.requestedAmount, curr.requestedAmount, " RON", false, 0),
  ].filter((x): x is HistoryDelta => x !== null);
}

/** Oldest first, one entry per id. */
export function mergeHistory(...lists: AssessmentSnapshot[][]) {
  const byId = new Map<string, AssessmentSnapshot>();
  for (const l of lists) for (const s of l) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
