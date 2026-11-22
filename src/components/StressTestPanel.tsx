"use client";

import { useState } from "react";
import { Activity, ShieldCheck } from "lucide-react";
import { LOAN_ANNUAL_RATE } from "@/lib/bcr-formulas";
import { effectiveDebtService } from "@/lib/company";
import { maxLoanAmount, maxSafeInstallment, SAFE_DSCR, stressTest } from "@/lib/loan-math";
import { getNumberLocale, monthLabel, num, ron } from "@/lib/util";
import { useAssessment } from "./AssessmentProvider";
import { LockedGate } from "./PlanGate";
import { Badge, Card, CardHeader, cx, TONE_TEXT } from "./ui";
import { tr } from "@/lib/i18n/tr";

const dscrLabel = () => SAFE_DSCR.toLocaleString(getNumberLocale(), { minimumFractionDigits: 2 });

/**
 * Seasonality stress test: "what if sales drop X% in a weak month?" — DSCR under stress (green / amber / red),
 * plus the safe monthly installment (DSCR ≥ 1,25) and the maximum recommended loan on 36 and 60 months.
 */
export function StressTestPanel() {
  const { company, assessment, investment } = useAssessment();
  const [drop, setDrop] = useState(20);
  const m = assessment.metrics;
  const ready = assessment.dataStatus.hasInvoices && assessment.dataStatus.financialsDeclared;
  const existing = effectiveDebtService(company);
  const installment = assessment.business.loanInstallment;
  const st = stressTest(m, company.monthlyFixedCosts, existing, installment, drop);
  const safeInstallment = maxSafeInstallment(m.operatingCashFlow, existing);
  const stressedSafe = maxSafeInstallment(st.stressedCashFlow, existing);
  const max36 = maxLoanAmount(safeInstallment, 36);
  const max60 = maxLoanAmount(safeInstallment, 60);
  const requested = investment.requestedAmount ?? 0;
  const DSCR_LABEL = dscrLabel();

  return (
    <Card className="mt-5 break-inside-avoid">
      <CardHeader
        icon={<Activity size={18} />}
        title={tr("Stress test de sezonalitate & capacitate maximă sigură")}
        subtitle={tr("Achizițiile scad odată cu vânzările; cheltuielile fixe ({f}/lună) și ratele rămân. Prag de siguranță: DSCR {d}.", { f: ron(company.monthlyFixedCosts), d: DSCR_LABEL })}
      />
      {!ready ? (
        <p className="rounded-xl bg-amber-soft px-4 py-3 text-xs font-medium text-amber">{tr("Stress testul are nevoie de facturile e-Factura și de cheltuielile fixe / ratele declarate în pasul 1.")}</p>
      ) : (
        <LockedGate feature="stressTest" title={tr("Stress testul este inclus în Planul Pro și în Pay-Per-Use")}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-sm font-medium text-ink">{tr("Ce se întâmplă dacă vânzările scad cu {d}% într-o lună slabă?", { d: drop })}</p>
              </div>
              <input type="range" min={0} max={50} step={1} value={drop} onChange={(e) => setDrop(Number(e.target.value))} className="w-full" aria-label={tr("Scădere vânzări în procente")} />
              <div className="flex justify-between text-[10px] text-faint">
                <span>0%</span>
                <span>−25%</span>
                <span>−50%</span>
              </div>

              <div className={cx("mt-4 rounded-2xl border p-4", st.tone === "emerald" ? "border-emerald/40 bg-emerald-soft/40" : st.tone === "amber" ? "border-amber/40 bg-amber-soft" : "border-red/30 bg-red-soft")}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs text-muted">{tr("DSCR în scenariul de stres (lună medie −{d}%)", { d: drop })}</p>
                  <Badge tone={st.tone}>{st.tone === "emerald" ? tr("Poate plăti rata") : st.tone === "amber" ? tr("La limită") : tr("Risc de neplată")}</Badge>
                </div>
                <p className={cx("mt-1 text-3xl font-light tracking-tight", TONE_TEXT[st.tone])}>{st.stressedDscr === null ? tr("fără rate") : `${num(st.stressedDscr)}×`}</p>
                <p className="mt-1 text-xs text-ink">{tr(st.verdict)}</p>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">{tr("Cash operațional sub stres")}</dt>
                    <dd className="font-medium text-ink">{ron(st.stressedCashFlow)} {tr("/ lună")}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{tr("Rate totale (existente + nouă)")}</dt>
                    <dd className="font-medium text-ink">{ron(st.debtService)} {tr("/ lună")}</dd>
                  </div>
                  {st.worstMonth && (
                    <div className="sm:col-span-2">
                      <dt className="text-muted">{tr("Cea mai slabă lună reală ({m}) cu −{d}%", { m: monthLabel(st.worstMonth), d: drop })}</dt>
                      <dd className={cx("font-medium", (st.worstMonthDscr ?? 99) >= SAFE_DSCR ? "text-emerald-strong" : (st.worstMonthDscr ?? 99) >= 1 ? "text-amber" : "text-red")}>
                        {ron(st.worstMonthCashFlow)} · DSCR {st.worstMonthDscr === null ? "—" : `${num(st.worstMonthDscr)}×`}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            <div className="grid content-start gap-3">
              <div className="rounded-2xl bg-navy p-5 text-white">
                <p className="flex items-center gap-1.5 text-xs text-white/60">
                  <ShieldCheck size={13} /> {tr("Rata lunară maximă sigură")}
                </p>
                <p className="mt-1 text-3xl font-light tracking-tight">{ron(safeInstallment)}<span className="text-base text-white/50"> {tr("/ lună")}</span></p>
                <p className="mt-1 text-[11px] text-white/55">
                  {tr("= cash operațional {c} / {d} − rate existente {e}. Sub stres −{p}%: {s} / lună.", { c: ron(m.operatingCashFlow), d: DSCR_LABEL, e: ron(existing), p: drop, s: ron(stressedSafe) })}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald/30 bg-emerald-soft/40 p-5">
                <p className="text-xs text-muted">{tr("Suma maximă recomandată de împrumutat")}</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-faint">{tr("pe 36 de luni")}</p>
                    <p className="text-2xl font-light tracking-tight text-ink">{ron(max36)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-faint">{tr("pe 60 de luni")}</p>
                    <p className="text-2xl font-light tracking-tight text-ink">{ron(max60)}</p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  {tr("La dobânda orientativă de {r}%/an.", { r: num(LOAN_ANNUAL_RATE * 100) })}{" "}
                  {requested > 0 && (requested > max60 ? <strong className="text-red">{tr("Suma cerută ({v}) depășește capacitatea pe 60 de luni: redu suma sau crește aportul.", { v: ron(requested) })}</strong> : <span className="text-emerald-strong">{tr("Suma cerută ({v}) se încadrează.", { v: ron(requested) })}</span>)}
                </p>
              </div>
            </div>
          </div>
        </LockedGate>
      )}
    </Card>
  );
}
