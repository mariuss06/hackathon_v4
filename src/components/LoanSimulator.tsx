"use client";

import { Calculator, ShieldCheck, TrendingDown } from "lucide-react";
import type { CollateralKind } from "@/types/scoring";
import { annuityInstallment, LOAN_ANNUAL_RATE, LOAN_MONTHS, principalForInstallment } from "@/lib/bcr-formulas";
import { effectiveDebtService } from "@/lib/company";
import { getNumberLocale, monthLabel, num, ron } from "@/lib/util";
import { useAssessment } from "./AssessmentProvider";
import { Badge, Button, Card, CardHeader, cx, Field, inputCls } from "./ui";
import { tr } from "@/lib/i18n/tr";

const TERMS = [24, 36, 48, 60, 84];
/** Minimum DSCR used for the "sustainable amount" (common covenant in Romanian SME lending). */
const TARGET_DSCR = 1.25;
const PESSIMISTIC_DROP = 0.2;

const COLLATERAL: { value: CollateralKind; label: string; hint: string }[] = [
  { value: "imobil", label: "Imobil (ipotecă)", hint: "Băncile acceptă de regulă doar o parte din valoarea de piață (evaluare ANEVAR)." },
  { value: "echipament", label: "Echipament / utilaj", hint: "Gaj în Registrul Național de Publicitate Mobiliară; valoarea acceptată scade cu vechimea." },
  { value: "fngcimm", label: "Garanție FNGCIMM / FGCR", hint: "Fondurile de garantare acoperă o parte din credit; procentul și costul depind de program." },
  { value: "fara", label: "Fără garanții", hint: "Doar creditele mici sau linii scurte se acordă fără garanții reale." },
];

/**
 * What a consultant does before the bank: how much the firm can actually carry, how its cash looks month by month
 * with the new installment (base and -20% revenue), and how the requested amount is covered by guarantees.
 * Everything is computed from the uploaded invoices and the declared costs / debts; nothing is estimated otherwise.
 */
export function LoanSimulator() {
  const { company, investment, setInvestment, assessment } = useAssessment();
  const m = assessment.metrics;
  const ready = assessment.dataStatus.hasInvoices && assessment.dataStatus.financialsDeclared;
  const term = investment.termMonths ?? LOAN_MONTHS;
  const amount = investment.requestedAmount ?? 0;
  const existing = effectiveDebtService(company);
  const installment = annuityInstallment(amount, LOAN_ANNUAL_RATE, term);
  const maxInstallment = Math.max(0, m.operatingCashFlow / TARGET_DSCR - existing);
  const sustainable = Math.floor(principalForInstallment(maxInstallment, LOAN_ANNUAL_RATE, term) / 1000) * 1000;

  // Month-by-month projection on the last 12 real months (keeps the firm's own seasonality).
  const rows = m.months.map((p) => {
    const ratio = p.revenue > 0 ? p.purchases / p.revenue : 0;
    const base = p.revenue - p.purchases - company.monthlyFixedCosts - existing - installment;
    const lowRevenue = p.revenue * (1 - PESSIMISTIC_DROP);
    const pessimistic = lowRevenue - lowRevenue * ratio - company.monthlyFixedCosts - existing - installment;
    return { month: p.month, base, pessimistic };
  });
  let cumBase = 0;
  let cumLow = 0;
  let minBase = 0;
  let minLow = 0;
  for (const r of rows) {
    cumBase += r.base;
    cumLow += r.pessimistic;
    minBase = Math.min(minBase, cumBase);
    minLow = Math.min(minLow, cumLow);
  }
  const negBase = rows.filter((r) => r.base < 0).length;
  const negLow = rows.filter((r) => r.pessimistic < 0).length;

  const collateral = investment.collateral ?? { kind: "fara" as CollateralKind, value: 0 };
  const coverage = amount > 0 && collateral.kind !== "fara" ? collateral.value / amount : 0;

  return (
    <Card className="mt-5">
      <CardHeader
        icon={<Calculator size={18} />}
        title={tr("Simulator de credit și proiecție de cash-flow")}
        subtitle={tr("Dobândă orientativă {r}%/an, rată anuitate. Pe facturile reale ale firmei și pe cheltuielile declarate.", { r: LOAN_ANNUAL_RATE * 100 })}
      />
      {!ready ? (
        <p className="rounded-xl bg-amber-soft px-4 py-3 text-xs font-medium text-amber">
          {tr("Simulatorul are nevoie de facturile e-Factura și de cheltuielile fixe / ratele existente declarate în pasul 1. Fără ele nu calculăm o sumă sau o proiecție.")}
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label={tr("Durata creditului")}>
              <div className="flex flex-wrap gap-1.5">
                {TERMS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setInvestment({ termMonths: t })}
                    className={cx("rounded-full border px-3 py-1.5 text-xs font-medium", t === term ? "border-navy bg-navy text-white" : "border-line-strong bg-white text-ink hover:border-navy-3")}
                  >
                    {tr("{n} luni", { n: t })}
                  </button>
                ))}
              </div>
            </Field>
            <div className="rounded-2xl border border-line/70 bg-white/60 p-4">
              <p className="text-xs text-muted">{tr("Rata nouă la suma cerută")}</p>
              <p className="mt-1 text-xl text-ink">{amount > 0 ? `${ron(installment)}${tr("/lună")}` : "—"}</p>
              <p className="text-[11px] text-faint">DSCR {amount > 0 || existing > 0 ? `${num(assessment.business.dscr)}×` : tr("fără datorii")} ({tr("minim uzual {d}×", { d: num(TARGET_DSCR) })})</p>
            </div>
            <div className="rounded-2xl border border-emerald/30 bg-emerald-soft/40 p-4">
              <p className="text-xs text-muted">{tr("Suma pe care firma o poate susține")}</p>
              <p className="mt-1 text-xl text-ink">{sustainable > 0 ? ron(sustainable) : "0 RON"}</p>
              <p className="text-[11px] text-faint">
                {tr("la DSCR {d}×, {t} luni · rată maximă {m}/lună", { d: num(TARGET_DSCR), t: term, m: ron(maxInstallment) })}
              </p>
              {sustainable > 0 && sustainable !== amount && (
                <Button variant="ghost" className="mt-2 px-0 py-1 text-xs" onClick={() => setInvestment({ requestedAmount: sustainable })}>
                  {tr("Folosește această sumă")}
                </Button>
              )}
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <TrendingDown size={15} className="text-navy-3" />
              <p className="text-sm font-medium text-ink">{tr("Cash-flow lunar cu rata nouă (ultimele 12 luni reale)")}</p>
              <Badge tone={negBase === 0 ? "emerald" : "amber"}>{tr("{n} luni negative (bază)", { n: negBase })}</Badge>
              <Badge tone={negLow === 0 ? "emerald" : negLow <= 3 ? "amber" : "red"}>{tr("{n} luni negative (vânzări −20%)", { n: negLow })}</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="text-faint">
                  <tr>
                    <th className="py-1.5 pr-3 font-semibold">{tr("Scenariu")}</th>
                    {rows.map((r) => (
                      <th key={r.month} className="py-1.5 pr-2 text-right font-semibold">
                        {monthLabel(r.month, false)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(["base", "pessimistic"] as const).map((k) => (
                    <tr key={k} className="border-t border-line">
                      <td className="py-1.5 pr-3 text-muted">{k === "base" ? tr("Bază") : tr("Vânzări −20%")}</td>
                      {rows.map((r) => (
                        <td key={r.month} className={cx("py-1.5 pr-2 text-right font-medium", r[k] < 0 ? "text-red" : "text-ink")}>
                          {num(Math.round(r[k] / 1000))}k
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {tr("Cash cumulat minim: {b} în scenariul de bază, {l} la vânzări −20%.", { b: ron(minBase), l: ron(minLow) })}{" "}
              {minLow < 0 ? tr("Ai nevoie de această rezervă (sau de o linie de credit) ca să treci de lunile slabe.") : tr("Firma rămâne pe plus și în scenariul pesimist.")}{" "}
              {tr("Proiecția nu include TVA, impozitul pe profit și investiția propriu-zisă.")}
            </p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
            <Field label={<span className="flex items-center gap-1.5"><ShieldCheck size={14} /> {tr("Garanție oferită")}</span>}>
              <select className={inputCls} value={collateral.kind} onChange={(e) => setInvestment({ collateral: { ...collateral, kind: e.target.value as CollateralKind } })}>
                {COLLATERAL.map((c) => (
                  <option key={c.value} value={c.value}>
                    {tr(c.label)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={tr("Valoare de piață (RON)")}>
              <input
                className={inputCls}
                inputMode="numeric"
                disabled={collateral.kind === "fara"}
                value={collateral.value ? collateral.value.toLocaleString(getNumberLocale()) : ""}
                onChange={(e) => setInvestment({ collateral: { ...collateral, value: Number(e.target.value.replace(/\D/g, "")) || 0 } })}
              />
            </Field>
            <div className="rounded-xl bg-canvas p-3 text-xs text-muted">
              {collateral.kind === "fara" || amount === 0 ? (
                tr(COLLATERAL.find((c) => c.value === collateral.kind)?.hint ?? "")
              ) : (
                <>
                  {tr("Acoperire:")} <strong className={coverage >= 1 ? "text-emerald-strong" : "text-amber"}>{num(Math.round(coverage * 100))}%</strong> {tr("din suma cerută.")}{" "}
                  {tr(COLLATERAL.find((c) => c.value === collateral.kind)?.hint ?? "")}
                  {coverage < 1 && ` ${tr("Completează cu o garanție FNGCIMM sau mărește aportul propriu.")}`}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
