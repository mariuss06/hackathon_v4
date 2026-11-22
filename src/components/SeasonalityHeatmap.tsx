"use client";

import { CalendarRange } from "lucide-react";
import { seasonalityMap } from "@/lib/loan-math";
import { monthLabel, ron, getNumberLocale } from "@/lib/util";
import { useAssessment } from "./AssessmentProvider";
import { Card, CardHeader, cx } from "./ui";
import { getTrLang, tr } from "@/lib/i18n/tr";

const MONTHS = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Noi", "Dec"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const TONE_CELL = {
  emerald: "bg-emerald-soft border-emerald/40 text-emerald-strong",
  amber: "bg-amber-soft border-amber/40 text-amber",
  red: "bg-red-soft border-red/40 text-red",
} as const;

/** Joins consecutive calendar months into ranges: [1,2,7] → "Ianuarie–Februarie, Iulie". */
function monthRanges(months: number[]) {
  const full =
    getTrLang() === "en"
      ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
      : ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(i === j ? full[sorted[i] - 1] : `${full[sorted[i] - 1]}–${full[sorted[j] - 1]}`);
    i = j;
  }
  return out.join(", ");
}

/**
 * 12-month heatmap on the firm's real months: cash left after purchases, fixed costs and existing
 * installments vs. the new installment. Green ≥ 1,25× the installment, amber 1–1,25×, red below.
 */
export function SeasonalityHeatmap() {
  const { assessment } = useAssessment();
  const m = assessment.metrics;
  const ready = assessment.dataStatus.hasInvoices && assessment.dataStatus.financialsDeclared;
  const installment = assessment.business.loanInstallment;
  const map = seasonalityMap(m.months, installment);
  const byCalendar = new Map(map.months.map((x) => [x.calendarMonth, x]));

  return (
    <Card className="mt-5 break-inside-avoid">
      <CardHeader
        icon={<CalendarRange size={18} />}
        title={tr("Heatmap de sezonalitate pe 12 luni")}
        subtitle={installment > 0 ? tr("Cash-ul rămas în fiecare lună reală vs. rata nouă estimată de {r}/lună.", { r: ron(installment) }) : tr("Cash-ul rămas în fiecare lună reală (completează suma solicitată pentru comparația cu rata).")}
      />
      {!ready ? (
        <p className="rounded-xl bg-amber-soft px-4 py-3 text-xs font-medium text-amber">{tr("Heatmap-ul folosește facturile e-Factura și cheltuielile fixe declarate în pasul 1.")}</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
            {(getTrLang() === "en" ? MONTHS_EN : MONTHS).map((label, i) => {
              const cell = byCalendar.get(i + 1);
              if (!cell) {
                return (
                  <div key={label} className="rounded-xl border border-dashed border-line p-2 text-center">
                    <p className="text-xs font-medium text-faint">{label}</p>
                    <p className="text-[10px] text-faint">{tr("fără date")}</p>
                  </div>
                );
              }
              return (
                <div key={label} className={cx("rounded-xl border p-2 text-center", TONE_CELL[cell.tone])} title={`${monthLabel(cell.month)}: ${ron(cell.available)} ${tr("disponibil")}`}>
                  <p className="text-xs font-semibold">{label}</p>
                  <p className="text-[10px] opacity-80">{cell.month.slice(0, 4)}</p>
                  <p className="mt-1 text-[11px] font-medium">{Math.round(cell.available / 1000).toLocaleString(getNumberLocale())}k</p>
                  {cell.coverage !== null && <p className="text-[10px] opacity-80">{cell.coverage.toLocaleString(getNumberLocale(), { maximumFractionDigits: 1 })}× {tr("rata")}</p>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald" /> {tr("confortabil (≥ 1,25× rata)")}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber" /> {tr("la limită (1–1,25×)")}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red" /> {tr("risc: încasările lunii nu acoperă rata")}</span>
          </div>
          <p className={cx("mt-4 rounded-xl px-4 py-3 text-sm", map.redMonths.length ? "bg-amber-soft text-ink" : "bg-emerald-soft text-emerald-strong")}>
            {map.redMonths.length
              ? tr(installment > 0 ? "În {months} ai nevoie de o rezervă de lichiditate de {v} pentru a acoperi rata fără stres." : "În {months} ai nevoie de o rezervă de lichiditate de {v} pentru a acoperi cheltuielile fără stres.", { months: monthRanges(map.redMonths.map((r) => r.calendarMonth)), v: ron(map.reserveNeeded) })
              : installment > 0
                ? tr("În toate cele 12 luni reale, încasările acoperă rata nouă: nu ai nevoie de o rezervă suplimentară.")
                : tr("Toate cele 12 luni reale au cash pozitiv după cheltuieli și ratele existente.")}
          </p>
        </>
      )}
    </Card>
  );
}
