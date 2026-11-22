"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import {
  BUSINESS_WEIGHTS,
  CONCENTRATION_BANDS,
  CV_BANDS,
  DSCR_BANDS,
  DSO_BANDS,
  LOAN_RATE_RANGE_PCT,
  QUIZ_KILL_SWITCH_MAX,
  QUIZ_KILL_SWITCH_PENALTY,
  RESILIENCE_BANDS,
  STORNO_PENALTY,
  STORNO_PENALTY_THRESHOLD_PCT,
  type Band,
} from "@/lib/bcr-formulas";
import { num } from "@/lib/util";
import { useAssessment } from "./AssessmentProvider";
import { Card, CardHeader, cx, Disclaimer } from "./ui";
import { tr } from "@/lib/i18n/tr";

function Bands({ bands, active }: { bands: Band[]; active: number }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {bands.map((b) => (
        <span
          key={b.label}
          className={cx(
            "rounded-full border px-2 py-0.5 text-[10px]",
            b.points === active ? "border-navy bg-navy text-white" : "border-line bg-white/70 text-muted",
          )}
        >
          {tr(b.label)} → {b.points} p
        </span>
      ))}
    </div>
  );
}

/** "Cum calculăm scorul": every formula and threshold, with the active company's values highlighted. */
export function HowWeScore() {
  const { assessment } = useAssessment();
  const [open, setOpen] = useState(false);

  // Collapsed by default: the full audit trail is one click away, not a wall of formulas.
  if (!open) {
    return (
      <div className="mt-5">
        <button
          type="button"
          id="cum-calculam"
          onClick={() => setOpen(true)}
          className="no-print inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-4 py-2 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <Info size={14} /> {tr("Cum calculăm scorul")} <ChevronDown size={13} aria-hidden />
        </button>
      </div>
    );
  }

  const { business: b, final: f, quiz: q, investment: inv, benchmark: bench } = assessment;
  const item = (id: string) => b.items.find((i) => i.id === id)!;
  const rows = [
    { id: "stability", w: BUSINESS_WEIGHTS.stability, bands: CV_BANDS, formula: tr("CV = σ / μ al vânzărilor lunare nete (12 luni)") },
    {
      id: "repayment",
      w: BUSINESS_WEIGHTS.repayment,
      bands: DSCR_BANDS,
      formula: tr("R = P · r(1+r)ⁿ / ((1+r)ⁿ − 1), r = {r}% / 12, n = {n}; DSCR = EBITDA lunar / (rate existente + R)", { r: num(b.loan.annualRatePct), n: b.loan.months }),
    },
    {
      id: "payments",
      w: BUSINESS_WEIGHTS.payments,
      bands: DSO_BANDS,
      formula: tr("DSO real ponderat cu valoarea facturilor; stornări 381 > {t}% (3 luni) → −{p} p", { t: STORNO_PENALTY_THRESHOLD_PCT, p: STORNO_PENALTY }),
    },
    { id: "concentration", w: BUSINESS_WEIGHTS.concentration, bands: CONCENTRATION_BANDS, formula: tr("Ponderea clientului #1 în vânzările pe 12 luni") },
    {
      id: "seasonality",
      w: BUSINESS_WEIGHTS.seasonality,
      bands: RESILIENCE_BANDS,
      formula: tr("Marja brută medie din cele mai slabe 3 luni / (cheltuieli fixe + rate existente + rata nouă)"),
    },
  ];

  return (
    <Card className="mt-5" id="cum-calculam">
      <CardHeader
        icon={<Info size={18} />}
        title={tr("Cum calculăm scorul")}
        subtitle={tr("Formula este publică, aliniată criteriilor de underwriting IMM din România.")}
        action={
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {tr("Ascunde")} <ChevronUp size={12} aria-hidden />
          </button>
        }
      />

      <div className="rounded-xl bg-canvas p-4 font-mono text-xs leading-relaxed text-ink">
        <p>{tr("ScorFinal = 0,70 × S_Business + 0,15 × S_Uman + 0,15 × S_Investiție (limitat 0–100)")}</p>
        <p className="text-muted">
          = 0,70 × {num(f.pillars.business.score)} + 0,15 × {num(f.pillars.human.score)} + 0,15 × {num(f.pillars.investment.score)} = {num(f.rawScore)}
          {f.quizKillSwitch && <span className="text-red"> − {QUIZ_KILL_SWITCH_PENALTY} (kill-switch) = {num(f.finalScore)}</span>}
        </p>
        <p className={cx("mt-1", f.quizKillSwitch ? "text-red" : "text-muted")}>
          {tr("Kill-switch guvernanță: ScorQuiz ≤ {m} → −{p} p din ScorFinal (acum Quiz = {q}, {state})", { m: QUIZ_KILL_SWITCH_MAX, p: QUIZ_KILL_SWITCH_PENALTY, q: q.total, state: f.quizKillSwitch ? tr("ACTIV") : tr("inactiv") })}
        </p>
      </div>

      <h3 className="mt-5 text-sm font-medium text-ink">
        S_Business · 70% <span className="text-xs font-normal text-muted">= {num(b.score)} / 100</span>
      </h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="text-faint">
            <tr>
              <th className="py-2 pr-3 font-semibold">{tr("Sub-indicator")}</th>
              <th className="py-2 pr-3 font-semibold">{tr("Pondere")}</th>
              <th className="py-2 pr-3 font-semibold">{tr("Formulă și praguri")}</th>
              <th className="py-2 text-right font-semibold">{tr("Firma activă")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const it = item(r.id);
              const base = r.id === "payments" && b.stornoPenaltyApplied ? it.score + STORNO_PENALTY : it.score;
              return (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="py-2.5 pr-3 font-medium text-ink">{tr(it.label)}</td>
                  <td className="py-2.5 pr-3">{Math.round(r.w * 100)}%</td>
                  <td className="py-2.5 pr-3 text-muted">
                    {r.formula}
                    <Bands bands={r.bands} active={Math.min(100, base)} />
                  </td>
                  <td className="py-2.5 text-right">
                    <p className="font-semibold text-ink">{num(it.score)} p</p>
                    <p className="text-[11px] text-muted">{tr(it.value)}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-4 text-xs leading-relaxed text-muted md:grid-cols-2">
        <div className="rounded-xl bg-canvas p-4">
          <p className="mb-1 text-sm font-semibold text-ink">{tr("S_Uman")} · 15% = {num(f.pillars.human.score)}</p>
          {f.pillars.human.externalScore !== undefined ? (
            <>
              {tr("S_Uman = 0,50 × ScorQuiz + 0,50 × ScorVerificariExterne = 0,5 × {q} + 0,5 × {e}. Quiz: 5 întrebări (35 + 25 + 20 + 12 + 8 = 100 p) validate automat pe facturile e-Factura încărcate. Verificări externe: media ponderată a surselor reale care au răspuns — portal.just.ro 30% {legal}, ANAF 25%, stare juridică ONRC 20%, bilanț 15%, VIES 10%. O sursă care nu răspunde sau cere CUI nu primește un punctaj inventat: este scoasă din medie.", { q: q.total, e: num(f.pillars.human.externalScore), legal: assessment.legalScore !== null ? tr("(scor legal {s})", { s: num(assessment.legalScore) }) : tr("(indisponibil)") })}
            </>
          ) : (
            <>
              {tr("S_Uman = 0,50 × ScorQuiz + 0,50 × ScorVerificariExterne. Nicio sursă externă nu a răspuns încă{pending}: scorul rămâne incomplet până la prima verificare reușită — nu folosim un punctaj neutru.", { pending: assessment.legalPending ? tr(" (portal.just.ro neverificat)") : "" })}
            </>
          )}
        </div>
        <div className="rounded-xl bg-canvas p-4">
          <p className="mb-1 text-sm font-semibold text-ink">{tr("S_Investiție")} · 15% = {num(f.pillars.investment.score)}</p>
          {tr("S_Investiție = 0,50 × ScorFormular + 0,50 × ScorComparațieIndustrie = 0,5 × {f} + 0,5 × {b}. Formular: destinație 50 p + aport 30 p + sumă / CA anualizată 20 p. Comparație cu sectorul „{s}” {src}: DSO, concentrare, stornări, sezonalitate, marjă vs. p25 / mediană / p75 (valori de referință orientative, nu statistici oficiale).", { f: inv.total, b: num(bench.score), s: tr(bench.sector.shortLabel), src: assessment.sectorSource === "caen" ? tr("(din codul CAEN)") : assessment.sectorSource === "manual" ? tr("(ales manual)") : tr("(implicit, fără CAEN)") })}
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        {tr("Dobândă orientativă IMM în România: {a}–{b}%/an; scorul folosește capătul inferior și maturitatea de {m} de luni. EBITDA lunar estimat = vânzări medii − achiziții medii (din facturile e-Factura) − cheltuieli fixe declarate de tine în pasul 1. DSCR include și ratele existente, ca în analiza de credit a băncii.", { a: num(LOAN_RATE_RANGE_PCT[0]), b: num(LOAN_RATE_RANGE_PCT[1]), m: b.loan.months })}
      </p>
      <Disclaimer className="mt-4" />
    </Card>
  );
}
