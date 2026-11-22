"use client";

import { ArrowRight, Building2, FlaskConical, Gavel, UserRound } from "lucide-react";
import type { PortalSimulationScenario } from "@/types/scoring";
import { ChoiceTile, NeuButton, Panel, QuestionHeader, Switch, TextInput } from "@/components/ui/neu";

export interface CompanyForm {
  companyName: string;
  ceoName: string;
  simulationMode: boolean;
  scenario: PortalSimulationScenario;
}

export const SCENARIOS: { value: PortalSimulationScenario; label: string; hint: string }[] = [
  { value: "clean", label: "Fără litigii", hint: "0 dosare · 100p" },
  { value: "minor", label: "Amenzi + litigiu în curs", hint: "niveluri 0-1 · 94p" },
  { value: "many", label: "Dosare mixte", hint: "datorie, executare, penal ușor, achitare · 66p" },
  { value: "critical", label: "Dosar critic", hint: "insolvență + evaziune · 0p + kill-switch" },
];

export function StepCompany({
  value,
  onChange,
  onNext,
}: {
  value: CompanyForm;
  onChange: (v: CompanyForm) => void;
  onNext: () => void;
}) {
  const valid = value.companyName.trim().length >= 3 && value.ceoName.trim().length >= 3;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      <Panel className="animate-rise">
        <h2 className="text-xl font-extrabold tracking-tight">Identificare firmă</h2>
        <p className="mt-1 text-sm text-muted">
          Numele firmei și al administratorului sunt folosite pentru interogarea publică a dosarelor pe
          portal.just.ro.
        </p>

        <div className="mt-7 space-y-7">
          <div>
            <QuestionHeader index={1} title="Denumirea firmei" htmlFor="companyName" />
            <TextInput
              id="companyName"
              icon={<Building2 size={18} />}
              value={value.companyName}
              onChange={(companyName) => onChange({ ...value, companyName })}
              placeholder="ex: Carpatica Ambalaje Industriale SRL"
            />
          </div>
          <div>
            <QuestionHeader index={2} title="Nume CEO / Administrator" htmlFor="ceoName" />
            <TextInput
              id="ceoName"
              icon={<UserRound size={18} />}
              value={value.ceoName}
              onChange={(ceoName) => onChange({ ...value, ceoName })}
              placeholder="ex: Maria Ionescu"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <NeuButton onClick={onNext} disabled={!valid}>
            Continuă la quiz <ArrowRight size={16} />
          </NeuButton>
        </div>
      </Panel>

      <Panel className="animate-rise [animation-delay:80ms]">
        <div className="flex items-start gap-4">
          <span className="neu-raised-sm grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-stone">
            <Gavel size={20} />
          </span>
          <div>
            <h3 className="font-bold">Verificare portal.just.ro</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              La pasul următor pornim în fundal o interogare SOAP reală (CautareDosare) după numele firmei și
              al administratorului. Rezultatul intră în pilonul Factor Uman (7,5% din scor).
            </p>
          </div>
        </div>

        <div className="neu-pressed mt-6 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <FlaskConical size={18} className={value.simulationMode ? "text-amber" : "text-muted"} />
              <div>
                <p className="text-sm font-bold">Mod Simulare Portal Just</p>
                <p className="text-xs text-muted">Pentru demo, dacă serverul guvernamental nu răspunde</p>
              </div>
            </div>
            <Switch
              label="Mod Simulare Portal Just"
              checked={value.simulationMode}
              onChange={(simulationMode) => onChange({ ...value, simulationMode })}
            />
          </div>

          {value.simulationMode && (
            <div role="radiogroup" aria-label="Scenariu simulare" className="mt-4 grid grid-cols-2 gap-3">
              {SCENARIOS.map((s) => (
                <ChoiceTile
                  key={s.value}
                  selected={value.scenario === s.value}
                  onClick={() => onChange({ ...value, scenario: s.value })}
                >
                  <span className="block pr-3">{s.label}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-muted">{s.hint}</span>
                </ChoiceTile>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
