"use client";

import { ArrowLeft, Boxes, Calculator, Factory, Megaphone, RefreshCw } from "lucide-react";
import type { InvestmentInput, InvestmentPurpose } from "@/types/scoring";
import { INVESTMENT_PURPOSES } from "@/lib/scoringEngine";
import { formatPct, formatRon } from "@/lib/format";
import { ChoiceTile, MoneyInput, NeuButton, Panel, QuestionHeader } from "@/components/ui/neu";

const ICONS: Record<InvestmentPurpose, typeof Factory> = {
  growth: Factory,
  working_capital: Boxes,
  marketing: Megaphone,
  refinancing: RefreshCw,
};

export function StepInvestment({
  value,
  annualizedRevenue,
  onChange,
  onBack,
  onSubmit,
}: {
  value: InvestmentInput;
  annualizedRevenue: number;
  onChange: (v: InvestmentInput) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const own = value.ownContributionPct ?? 0;
  const amount = value.requestedAmount ?? 0;
  const ratio = annualizedRevenue > 0 ? (amount / annualizedRevenue) * 100 : 0;
  const valid = value.purpose !== null && value.ownContributionPct !== null && amount > 0;

  return (
    <Panel className="animate-rise">
      <h2 className="text-xl font-extrabold tracking-tight">Quiz 2 · Scopul investiției</h2>
      <p className="mt-1 text-sm text-muted">Pentru ce ai nevoie de finanțare și cât de mult te implici.</p>

      <div className="mt-8 space-y-10">
        <div>
          <QuestionHeader index={1} title="Destinația principală a finanțării" />
          <div role="radiogroup" aria-label="Destinația finanțării" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {INVESTMENT_PURPOSES.map((p) => {
              const Icon = ICONS[p.value];
              const selected = value.purpose === p.value;
              return (
                <ChoiceTile
                  key={p.value}
                  selected={selected}
                  onClick={() => onChange({ ...value, purpose: p.value })}
                  className="p-5"
                >
                  <span
                    className={
                      selected
                        ? "btn-primary grid h-11 w-11 place-items-center rounded-xl"
                        : "neu-pressed-sm grid h-11 w-11 place-items-center rounded-xl text-stone"
                    }
                  >
                    <Icon size={20} />
                  </span>
                  <span className="mt-4 block text-[15px] leading-snug">{p.label}</span>
                  <span className="mt-1 block text-xs font-medium text-muted">{p.hint}</span>
                </ChoiceTile>
              );
            })}
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <QuestionHeader
              index={2}
              htmlFor="own"
              title="Aportul propriu / avans"
              hint="Procent din valoarea proiectului acoperit din surse proprii"
             
            />
            <div className="neu-pressed rounded-2xl p-5">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-4xl font-bold text-ink">{own}%</span>
                <span className="text-xs text-muted">0 – 60%</span>
              </div>
              <input
                id="own"
                type="range"
                min={0}
                max={60}
                step={1}
                value={own}
                onChange={(e) => onChange({ ...value, ownContributionPct: Number(e.target.value) })}
                className="neu-range mt-5 w-full"
              />
              <div className="relative mt-2 h-4 font-mono text-[10px] text-muted">
                <span className="absolute" style={{ left: `${(10 / 60) * 100}%`, transform: "translateX(-50%)" }}>
                  10%
                </span>
                <span className="absolute" style={{ left: `${(20 / 60) * 100}%`, transform: "translateX(-50%)" }}>
                  20%
                </span>
              </div>
            </div>
          </div>

          <div>
            <QuestionHeader
              index={3}
              htmlFor="amount"
              title="Suma solicitată"
              hint="Comparată cu cifra de afaceri anualizată din e-Factura"
             
            />
            <MoneyInput
              id="amount"
              value={value.requestedAmount}
              onChange={(requestedAmount) => onChange({ ...value, requestedAmount })}
              placeholder="ex: 350.000"
            />
            <p className="mt-3 text-xs text-muted">
              CA anualizată e-Factura: <span className="font-mono text-ink">{formatRon(annualizedRevenue)}</span>
              {amount > 0 && (
                <>
                  {" "}· cererea reprezintă <span className="font-mono text-stone">{formatPct(ratio)}</span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10 flex flex-col-reverse gap-4 sm:flex-row sm:justify-between">
        <NeuButton variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Înapoi la quiz
        </NeuButton>
        <NeuButton onClick={onSubmit} disabled={!valid}>
          <Calculator size={16} /> Calculează scorul
        </NeuButton>
      </div>
    </Panel>
  );
}
