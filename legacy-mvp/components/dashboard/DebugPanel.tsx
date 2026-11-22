"use client";

import { useState } from "react";
import { Bug, ChevronDown, FlaskConical, RotateCcw, Snowflake } from "lucide-react";
import type { CompanyAssessment, PortalSimulationScenario } from "@/types/scoring";
import {
  clientShareToBucket,
  CREDIT_NOTE_THRESHOLD_PCT,
  paymentTermToBucket,
  rankSuppliers,
} from "@/lib/scoringEngine";
import type { BusinessScoreBreakdown } from "@/services/businessScoreService";
import { formatPoints, formatRon } from "@/lib/format";
import { cx, NeuButton } from "@/components/ui/neu";
import { SCENARIOS } from "@/components/wizard/StepCompany";

function NumField({
  label,
  value,
  onChange,
  suffix,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <div className="neu-pressed-sm mt-1.5 flex items-center rounded-xl px-3 focus-within:ring-1 focus-within:ring-stone/60">
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="w-full bg-transparent py-2 font-mono text-sm text-ink focus:outline-none"
        />
        {suffix && <span className="ml-2 text-[10px] font-bold text-muted">{suffix}</span>}
      </div>
      {hint && <span className="mt-1 block text-[10px] text-stone">{hint}</span>}
    </label>
  );
}

export function DebugPanel({
  assessment,
  business,
  onChange,
  onReevaluateQuiz,
  onReset,
  simulationScenario,
  onRunSimulation,
  onRunLive,
}: {
  assessment: CompanyAssessment;
  business: BusinessScoreBreakdown;
  onChange: (a: CompanyAssessment) => void;
  onReevaluateQuiz: () => void;
  onReset: () => void;
  simulationScenario: PortalSimulationScenario;
  onRunSimulation: (s: PortalSimulationScenario) => void;
  onRunLive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const t = assessment.groundTruth;
  const m = assessment.sBusinessMock;
  const ranked = rankSuppliers(t);

  const setTruth = (patch: Partial<typeof t>) => onChange({ ...assessment, groundTruth: { ...t, ...patch } });
  const setMock = (patch: Partial<typeof m>) => onChange({ ...assessment, sBusinessMock: { ...m, ...patch } });

  return (
    <section className="neu-raised rounded-[28px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
      >
        <span className="flex items-center gap-3">
          <Bug size={18} className="text-amber" />
          <span className="text-sm font-bold">Date Mock (Debug / Demo)</span>
          <span className="hidden text-xs text-muted sm:inline">EFacturaGroundTruth · sBusinessMock · scenarii Portal Just</span>
        </span>
        <ChevronDown size={18} className={cx("text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-8 border-t border-white/5 px-6 pb-7 pt-6">
          <div>
            <h4 className="mb-4 font-mono text-xs font-bold tracking-wider text-stone">EFacturaGroundTruth</h4>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumField
                label="CA 3 luni (fără TVA)"
                suffix="RON"
                step={1000}
                value={t.revenueLast3MonthsNoVat}
                onChange={(v) => setTruth({ revenueLast3MonthsNoVat: v, annualizedRevenue: v * 4 })}
                hint={`Anualizat: ${formatRon(t.annualizedRevenue)}`}
              />
              <NumField
                label="Termen mediu plată"
                suffix="zile"
                value={t.avgPaymentTermDays}
                onChange={(v) => setTruth({ avgPaymentTermDays: v })}
                hint={`Interval: ${paymentTermToBucket(t.avgPaymentTermDays)} zile`}
              />
              <NumField
                label="Pondere client #1"
                suffix="%"
                step={0.5}
                value={t.topClientSharePct}
                onChange={(v) => setTruth({ topClientSharePct: v })}
                hint={`Prag: ${clientShareToBucket(t.topClientSharePct)}%`}
              />
              <NumField
                label="Stornări (cod 381)"
                suffix="%"
                step={0.5}
                value={t.creditNotesSharePct}
                onChange={(v) => setTruth({ creditNotesSharePct: v })}
                hint={t.creditNotesSharePct > CREDIT_NOTE_THRESHOLD_PCT ? "Semnificativ: Da" : "Semnificativ: Nu"}
              />
            </div>

            <h5 className="mb-3 mt-6 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Top 5 furnizori (valoare achiziții, RON) — rangul se recalculează
            </h5>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {t.topSuppliers.map((s, i) => (
                <NumField
                  key={s.cui}
                  label={s.name}
                  step={1000}
                  value={s.purchaseValue}
                  onChange={(v) =>
                    setTruth({
                      topSuppliers: t.topSuppliers.map((x, j) => (j === i ? { ...x, purchaseValue: v } : x)),
                    })
                  }
                  hint={`Rang #${ranked.findIndex((r) => r.cui === s.cui) + 1}`}
                />
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted">Nume capcană: {t.decoySuppliers.join(" · ")}</p>
          </div>

          <div>
            <h4 className="mb-4 font-mono text-xs font-bold tracking-wider text-stone">sBusinessMock</h4>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumField label="Metrici proprii (75%)" suffix="/100" value={m.ownMetricsScore} onChange={(v) => setMock({ ownMetricsScore: v })} />
              <NumField label="Benchmark CAEN (25%)" suffix="/100" value={m.industryBenchmarkScore} onChange={(v) => setMock({ industryBenchmarkScore: v })} />
              <div className="neu-pressed-sm rounded-xl p-3 sm:col-span-2">
                <p className="text-[11px] uppercase tracking-wider text-muted">S_Business calculat</p>
                <p className="mt-1 font-mono text-sm">
                  0,75 × {formatPoints(business.ownMetrics)}
                  {business.momentumAdjustment !== 0 && (
                    <span className="text-positive"> (incl. +{formatPoints(business.momentumAdjustment)} upload)</span>
                  )}{" "}
                  + 0,25 × {formatPoints(business.industryBenchmark)} ={" "}
                  <span className="font-bold text-stone">{formatPoints(business.sBusiness)}</span>
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-mono text-xs font-bold tracking-wider text-stone">Portal Just</h4>
            <div className="flex flex-wrap gap-3">
              {SCENARIOS.map((s) => (
                <NeuButton
                  key={s.value}
                  variant="ghost"
                  className={cx("px-3 py-2 text-xs", simulationScenario === s.value && "text-amber")}
                  onClick={() => onRunSimulation(s.value)}
                >
                  <FlaskConical size={14} /> {s.label}
                </NeuButton>
              ))}
              <NeuButton variant="ghost" className="px-3 py-2 text-xs" onClick={onRunLive}>
                Interogare reală
              </NeuButton>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-white/5 pt-6">
            <NeuButton variant="ghost" className="text-xs" onClick={onReevaluateQuiz}>
              <Snowflake size={14} /> Re-îngheață Quiz 1 cu datele curente
            </NeuButton>
            <NeuButton variant="danger" className="text-xs" onClick={onReset}>
              <RotateCcw size={14} /> Resetează datele mock
            </NeuButton>
          </div>
        </div>
      )}
    </section>
  );
}
