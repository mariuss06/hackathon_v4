"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Banknote, FlaskConical, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import { computeAssessment, type Assessment } from "@/lib/assessment";
import { CREDIT_READY_MIN_SCORE } from "@/lib/bcr-formulas";
import { cashFreedByDso } from "@/lib/loan-math";
import type { BankRecommendation } from "@/lib/bank-matcher";
import { num, ron } from "@/lib/util";
import { useAssessment } from "./AssessmentProvider";
import { BankLogo } from "./BankLogos";
import { LockedGate } from "./PlanGate";
import { Badge, Button, Card, CardHeader, cx } from "./ui";
import { tr } from "@/lib/i18n/tr";

interface SimValues {
  dso: number;
  concentration: number;
  own: number;
  amount: number;
}

const clampN = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

function verdict(a: Assessment) {
  const ready = a.final.finalScore >= CREDIT_READY_MIN_SCORE && !a.banks.all.every((b) => !b.eligible) && a.banks.creditReady;
  return ready ? { label: "CREDIT READY", tone: "emerald" as const } : { label: tr("RESPINS"), tone: "red" as const };
}

/** Best product of each bank in the simulated profile, with the same product's status in the real profile. */
function bankImpact(real: Assessment, sim: Assessment) {
  const byBank = new Map<string, { sim: BankRecommendation; real: BankRecommendation | undefined }>();
  for (const r of sim.banks.all) {
    const cur = byBank.get(r.bank);
    if (!cur || r.matchPct > cur.sim.matchPct || (r.eligible && !cur.sim.eligible)) byBank.set(r.bank, { sim: r, real: real.banks.all.find((x) => x.id === r.id) });
  }
  return [...byBank.values()].sort((a, b) => Number(b.sim.eligible) - Number(a.sim.eligible) || b.sim.matchPct - a.sim.matchPct);
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  real,
  onChange,
  format = (v: number) => num(v),
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  real: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
}) {
  const changed = Math.abs(value - real) >= step / 2;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-sm">
          <span className={cx("font-semibold", changed ? "text-emerald-strong" : "text-ink")}>
            {format(value)}
            {unit}
          </span>
          {changed && (
            <span className="ml-1.5 text-[11px] text-faint">
              {tr("real")} {format(real)}
              {unit}
            </span>
          )}
        </p>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" aria-label={label} />
      <div className="flex justify-between text-[10px] text-faint">
        <span>
          {format(min)}
          {unit}
        </span>
        {hint && <span>{hint}</span>}
        <span>
          {format(max)}
          {unit}
        </span>
      </div>
    </div>
  );
}

/**
 * "What-If": instant, 100% client-side simulation on the firm's real profile. Nothing is saved:
 * the sliders only replace DSO, client concentration, own contribution and amount in a copy of the
 * inputs, and the SAME engine (computeAssessment + bank matcher) recalculates score and banks.
 */
export function WhatIfSimulator() {
  const { company, invoices, quiz, investment, legal, verification, assessment, today } = useAssessment();
  const m = assessment.metrics;

  const amountMax = useMemo(
    () => Math.max(100_000, roundTo(Math.max((investment.requestedAmount ?? 0) * 2, m.annualizedRevenue * 0.8), 10_000)),
    [investment.requestedAmount, m.annualizedRevenue],
  );
  const real: SimValues = useMemo(
    () => ({
      dso: clampN(Math.round(m.dsoDays), 0, 90),
      concentration: clampN(Math.round(m.topClientSharePct), 5, 90),
      own: clampN(Math.round(investment.ownContributionPct ?? 0), 0, 40),
      amount: clampN(roundTo(investment.requestedAmount ?? Math.max(50_000, m.annualizedRevenue * 0.2), 5_000), 10_000, amountMax),
    }),
    [m.dsoDays, m.topClientSharePct, m.annualizedRevenue, investment.ownContributionPct, investment.requestedAmount, amountMax],
  );
  const [sim, setSim] = useState<SimValues>(real);
  const [demoRunning, setDemoRunning] = useState(false);
  const timers = useRef<number[]>([]);
  const frame = useRef<number | null>(null);

  // A new company or new real data: start again from the real values.
  const realKey = `${company.id}|${real.dso}|${real.concentration}|${real.own}|${real.amount}`;
  const [syncedKey, setSyncedKey] = useState(realKey);
  if (syncedKey !== realKey) {
    setSyncedKey(realKey);
    setSim(real);
  }

  const stopDemo = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setDemoRunning(false);
  };
  useEffect(() => () => stopDemo(), []);

  const simulated = useMemo(
    () =>
      computeAssessment({
        company,
        invoices,
        quiz,
        investment: { ...investment, ownContributionPct: sim.own, requestedAmount: sim.amount },
        legal,
        verification,
        today,
        metricsOverride: { dsoDays: sim.dso, topClientSharePct: sim.concentration },
      }),
    [company, invoices, quiz, investment, legal, verification, today, sim],
  );

  const before = verdict(assessment);
  const after = verdict(simulated);
  const delta = Math.round((simulated.final.finalScore - assessment.final.finalScore) * 10) / 10;
  const banks = bankImpact(assessment, simulated);
  const freed = cashFreedByDso(m.annualizedRevenue, m.dsoDays, sim.dso);
  const turnedGreen = banks.filter((b) => b.sim.eligible && !b.real?.eligible).length;

  /** Demo for the pitch: a rejected profile animates into an accepted one on this firm's real numbers. */
  const runDemo = () => {
    stopDemo();
    setDemoRunning(true);
    const rejected: SimValues = { dso: 75, concentration: 70, own: 0, amount: clampN(roundTo(real.amount * 1.6, 10_000), 10_000, amountMax) };
    const accepted: SimValues = { dso: 25, concentration: 20, own: 25, amount: clampN(roundTo(Math.min(real.amount, amountMax * 0.5), 10_000), 10_000, amountMax) };
    setSim(rejected);
    timers.current.push(
      window.setTimeout(() => {
        const t0 = performance.now();
        const D = 2400;
        const step = (t: number) => {
          const k = Math.min(1, (t - t0) / D);
          const e = 1 - (1 - k) ** 3;
          setSim({
            dso: Math.round(rejected.dso + (accepted.dso - rejected.dso) * e),
            concentration: Math.round(rejected.concentration + (accepted.concentration - rejected.concentration) * e),
            own: Math.round(rejected.own + (accepted.own - rejected.own) * e),
            amount: roundTo(rejected.amount + (accepted.amount - rejected.amount) * e, 5_000),
          });
          if (k < 1) frame.current = requestAnimationFrame(step);
          else {
            frame.current = null;
            setDemoRunning(false);
          }
        };
        frame.current = requestAnimationFrame(step);
      }, 1200),
    );
  };

  return (
    <Card className="no-print mt-5" id="what-if">
      <CardHeader
        icon={<FlaskConical size={18} />}
        title={tr("Simulator What-If — ce se întâmplă dacă…")}
        subtitle={tr("Mișcă sliderele: scorul, băncile și lichiditatea se recalculează instant cu aceleași formule, pe datele reale ale firmei. Nimic nu se salvează.")}
        action={<Badge tone="blue">{tr("100% în browser · instant")}</Badge>}
      />
      {!assessment.final.complete ? (
        <p className="rounded-xl bg-amber-soft px-4 py-3 text-xs font-medium text-amber">
          {tr("Simulatorul pornește de la valorile reale ale firmei. Lipsesc: {m}.", { m: (assessment.final.missing ?? []).map((x) => tr(x)).join("; ") })}
        </p>
      ) : (
        <LockedGate feature="whatIfSimulator" title={tr("Simulatorul What-If este inclus în Planul Pro și în Pay-Per-Use")}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="min-w-0 space-y-5">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" className="px-3.5 py-2 text-xs" onClick={() => (stopDemo(), setSim(real))}>
                  <RotateCcw size={13} /> {tr("Resetează la valorile reale")}
                </Button>
                <Button className="px-3.5 py-2 text-xs" onClick={runDemo} disabled={demoRunning}>
                  <Play size={13} /> {tr("Simulează firmă respinsă → acceptată")}
                </Button>
              </div>
              <SliderRow label={tr("Termen mediu de încasare (DSO)")} value={sim.dso} min={0} max={90} step={1} unit={` ${tr("zile")}`} real={real.dso} onChange={(v) => (stopDemo(), setSim((s) => ({ ...s, dso: v })))} hint={tr("bănci: ≤ 30 ideal")} />
              <SliderRow
                label={tr("Dependența de cel mai mare client")}
                value={sim.concentration}
                min={5}
                max={90}
                step={1}
                unit="%"
                real={real.concentration}
                onChange={(v) => (stopDemo(), setSim((s) => ({ ...s, concentration: v })))}
                hint={tr("ING: sub 40%")}
              />
              <SliderRow label={tr("Aport propriu (avans)")} value={sim.own} min={0} max={40} step={1} unit="%" real={real.own} onChange={(v) => (stopDemo(), setSim((s) => ({ ...s, own: v })))} hint="BCR 15% · Raiffeisen 20%" />
              <SliderRow
                label={tr("Suma solicitată")}
                value={sim.amount}
                min={10_000}
                max={amountMax}
                step={5_000}
                unit=" RON"
                real={real.amount}
                format={(v) => num(v)}
                onChange={(v) => (stopDemo(), setSim((s) => ({ ...s, amount: v })))}
              />
              <p className="flex items-center gap-1.5 text-[11px] text-faint">
                <SlidersHorizontal size={12} /> {tr("Sliderele pornesc de la valorile reale; datele salvate nu se modifică.")}
              </p>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="grid grid-cols-1 items-center gap-3 rounded-2xl bg-canvas p-4 sm:grid-cols-[1fr_auto_1fr]">
                <div>
                  <p className="text-[11px] text-muted">{tr("Scor actual")}</p>
                  <p className="text-3xl font-light tracking-tight text-ink">
                    {num(assessment.final.finalScore)}
                    <span className="text-base text-faint">/100</span>
                  </p>
                  <Badge tone={before.tone}>{before.label}</Badge>
                </div>
                <ArrowRight size={18} className="hidden text-faint sm:block" />
                <div>
                  <p className="text-[11px] text-muted">{tr("Scor simulat")}</p>
                  <p className={cx("text-3xl font-light tracking-tight", after.tone === "emerald" ? "text-emerald-strong" : "text-red")}>
                    {num(simulated.final.finalScore)}
                    <span className="text-base text-faint">/100</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={after.tone}>{after.label}</Badge>
                    {delta !== 0 && (
                      <Badge tone={delta > 0 ? "emerald" : "red"}>
                        {delta > 0 ? "+" : ""}
                        {num(delta)} {tr("puncte")}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-line p-3">
                  <p className="text-[11px] text-muted">{tr("S_Business simulat")}</p>
                  <p className="text-lg text-ink">
                    {num(simulated.final.pillars.business.score)} <span className="text-xs text-faint">vs {num(assessment.final.pillars.business.score)}</span>
                  </p>
                </div>
                <div className="rounded-xl border border-line p-3">
                  <p className="text-[11px] text-muted">{tr("DSCR simulat")}</p>
                  <p className="text-lg text-ink">
                    {simulated.business.dscr >= 99 ? "—" : `${num(simulated.business.dscr)}×`}{" "}
                    <span className="text-xs text-faint">{tr("rată")} {ron(simulated.business.loanInstallment)}</span>
                  </p>
                </div>
                <div className={cx("rounded-xl border p-3", freed > 0 ? "border-emerald/40 bg-emerald-soft/40" : "border-line")}>
                  <p className="flex items-center gap-1 text-[11px] text-muted">
                    <Banknote size={12} /> {tr("Impact pe lichiditate")}
                  </p>
                  <p className={cx("text-lg", freed > 0 ? "text-emerald-strong" : freed < 0 ? "text-red" : "text-ink")}>
                    {freed > 0 ? "+" : ""}
                    {ron(freed)}
                  </p>
                  <p className="text-[10px] text-faint">{tr("cash eliberat prin DSO {a} → {b} zile", { a: Math.round(m.dsoDays), b: sim.dso })}</p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{tr("Impact pe băncile din România")}</p>
                  {turnedGreen > 0 && <Badge tone="emerald">{tr("{n} bănci devin eligibile", { n: turnedGreen })}</Badge>}
                </div>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {banks.map(({ sim: s, real: r }) => {
                    const flipped = s.eligible && !r?.eligible;
                    return (
                      <li
                        key={s.bank}
                        className={cx(
                          "flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors duration-300",
                          s.eligible ? "border-emerald/40 bg-emerald-soft/40" : "border-red/25 bg-red-soft/40",
                          flipped && "animate-flash",
                        )}
                      >
                        <BankLogo bank={s.bank} size={30} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-ink">{s.bank}</p>
                          <p className="truncate text-[10px] text-muted">{tr(s.product)}</p>
                        </div>
                        <div className="text-right">
                          <p className={cx("text-[11px] font-semibold", s.eligible ? "text-emerald-strong" : "text-red")}>{s.eligible ? tr("Eligibil") : tr("Neeligibil")}</p>
                          <p className="text-[10px] text-faint">
                            {r && r.eligible !== s.eligible ? `${tr("era")} ${r.eligible ? tr("eligibil") : tr("neeligibil")} · ` : ""}
                            {s.matchPct}%
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </LockedGate>
      )}
    </Card>
  );
}
