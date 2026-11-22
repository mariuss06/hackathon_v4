"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Snowflake } from "lucide-react";
import type { EFacturaGroundTruth, QuizAnswers } from "@/types/scoring";
import { CLIENT_SHARE_BUCKETS, PAYMENT_TERM_BUCKETS } from "@/lib/scoringEngine";
import { ChoiceTile, cx, MoneyInput, NeuButton, Panel, QuestionHeader } from "@/components/ui/neu";

export const EMPTY_QUIZ: QuizAnswers = {
  revenueEstimate: null,
  paymentTerm: null,
  topClientShare: null,
  mainSupplier: null,
  hasSignificantCreditNotes: null,
};

/** Delay before moving on after a choice, so the selected tile is visible. */
const AUTO_ADVANCE_MS = 320;

interface Question {
  title: string;
  hint?: string;
  htmlFor?: string;
  answered: boolean;
  body: ReactNode;
}

export function StepFinancialQuiz({
  truth,
  value,
  onChange,
  onBack,
  onSubmit,
}: {
  truth: EFacturaGroundTruth;
  value: QuizAnswers;
  onChange: (v: QuizAnswers) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  // Real top 5 + decoys, alphabetical so the order reveals nothing.
  const supplierOptions = useMemo(
    () =>
      [...truth.topSuppliers.map((s) => s.name), ...truth.decoySuppliers].sort((a, b) =>
        a.localeCompare(b, "ro"),
      ),
    [truth],
  );

  const choose = (patch: Partial<QuizAnswers>) => {
    onChange({ ...value, ...patch });
    clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => setIndex((i) => Math.min(i + 1, questions.length - 1)), AUTO_ADVANCE_MS);
  };

  const questions: Question[] = [
    {
      title: "Cifra de afaceri facturată în ultimele 3 luni",
      hint: "Fără TVA, total facturi emise",
      htmlFor: "revenue",
      answered: value.revenueEstimate !== null && value.revenueEstimate > 0,
      body: (
        <div
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.revenueEstimate) setIndex(1);
          }}
        >
          <MoneyInput
            id="revenue"
            value={value.revenueEstimate}
            onChange={(revenueEstimate) => onChange({ ...value, revenueEstimate })}
            placeholder="ex: 450.000"
            autoFocus
          />
          <p className="mt-3 text-xs text-muted">Apasă Enter pentru a continua.</p>
        </div>
      ),
    },
    {
      title: "Termenul mediu de plată oferit clienților",
      answered: value.paymentTerm !== null,
      body: (
        <div role="radiogroup" aria-label="Termen mediu de plată" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PAYMENT_TERM_BUCKETS.map((b) => (
            <ChoiceTile
              key={b.value}
              selected={value.paymentTerm === b.value}
              onClick={() => choose({ paymentTerm: b.value })}
              className="py-5 text-center"
            >
              {b.label}
            </ChoiceTile>
          ))}
        </div>
      ),
    },
    {
      title: "Ponderea celui mai mare client în vânzări",
      hint: "Cât din totalul facturat merge către clientul principal",
      answered: value.topClientShare !== null,
      body: (
        <div role="radiogroup" aria-label="Pondere client principal" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CLIENT_SHARE_BUCKETS.map((b) => (
            <ChoiceTile
              key={b.value}
              selected={value.topClientShare === b.value}
              onClick={() => choose({ topClientShare: b.value })}
              className="py-5 text-center"
            >
              {b.label}
            </ChoiceTile>
          ))}
        </div>
      ),
    },
    {
      title: "Principalul furnizor după valoarea achizițiilor",
      hint: "Alege firma de la care ai cumpărat cel mai mult în ultimele 3 luni",
      answered: value.mainSupplier !== null,
      body: (
        <div role="radiogroup" aria-label="Furnizor principal" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {supplierOptions.map((name) => (
            <ChoiceTile key={name} selected={value.mainSupplier === name} onClick={() => choose({ mainSupplier: name })}>
              <span className="block pr-4 leading-snug">{name}</span>
            </ChoiceTile>
          ))}
        </div>
      ),
    },
    {
      title: "Facturi stornate semnificative în ultimele 3 luni?",
      hint: "Peste 5% din totalul emis (InvoiceTypeCode 381)",
      answered: value.hasSignificantCreditNotes !== null,
      body: (
        <div role="radiogroup" aria-label="Facturi stornate" className="grid grid-cols-2 gap-3">
          {[
            { v: true, l: "Da" },
            { v: false, l: "Nu" },
          ].map((o) => (
            <ChoiceTile
              key={o.l}
              selected={value.hasSignificantCreditNotes === o.v}
              onClick={() => choose({ hasSignificantCreditNotes: o.v })}
              className="py-5 text-center"
            >
              {o.l}
            </ChoiceTile>
          ))}
        </div>
      ),
    },
  ];

  const total = questions.length;
  const q = questions[index];
  const answered = questions.filter((x) => x.answered).length;
  const isLast = index === total - 1;
  // A question can be opened once every question before it is answered.
  const reachable = (i: number) => questions.slice(0, i).every((x) => x.answered);

  const goBack = () => {
    clearTimeout(advanceTimer.current);
    if (index === 0) onBack();
    else setIndex(index - 1);
  };

  return (
    <Panel className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Quiz 1 · Cunoaștere financiară</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Răspunde din memorie. Răspunsurile tale sunt comparate cu datele reale din RO e-Factura pentru{" "}
            <span className="text-ink">{truth.companyName}</span>.
          </p>
        </div>
        <div className="neu-pressed-sm rounded-full px-4 py-2 font-mono text-xs text-muted">
          Întrebarea <span className="text-stone">{index + 1}</span> din {total}
        </div>
      </div>

      <div className="mt-6 flex gap-2" aria-label={`${answered} din ${total} răspunsuri`}>
        {questions.map((x, i) => (
          <button
            key={x.title}
            type="button"
            aria-label={`Întrebarea ${i + 1}${x.answered ? " (răspuns dat)" : ""}`}
            aria-current={i === index ? "step" : undefined}
            disabled={!reachable(i)}
            onClick={() => {
              clearTimeout(advanceTimer.current);
              setIndex(i);
            }}
            className="neu-pressed-sm h-2.5 flex-1 overflow-hidden rounded-full p-[2px] disabled:cursor-not-allowed"
          >
            <span
              className={cx(
                "block h-full rounded-full transition-all duration-300",
                i === index ? "bg-stone shadow-[0_0_10px_var(--accent-stone)]" : x.answered ? "bg-stone/55" : "bg-transparent",
              )}
            />
          </button>
        ))}
      </div>

      <div key={index} className="animate-rise mx-auto mt-10 min-h-[200px] max-w-3xl">
        <QuestionHeader index={index + 1} htmlFor={q.htmlFor} title={q.title} hint={q.hint} />
        {q.body}
      </div>

      <div className="mt-10 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <NeuButton variant="ghost" onClick={goBack}>
          <ArrowLeft size={16} /> {index === 0 ? "Înapoi la firmă" : "Întrebarea anterioară"}
        </NeuButton>
        {isLast ? (
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <NeuButton onClick={onSubmit} disabled={answered < total}>
              <Snowflake size={16} /> Îngheață răspunsurile și continuă
            </NeuButton>
            <span className="text-center text-[11px] text-muted sm:text-right">
              Scorul quiz-ului se îngheață la trimitere, ca în producție.
            </span>
          </div>
        ) : (
          <NeuButton
            onClick={() => {
              clearTimeout(advanceTimer.current);
              setIndex(index + 1);
            }}
            disabled={!q.answered}
          >
            Următoarea întrebare <ArrowRight size={16} />
          </NeuButton>
        )}
      </div>
    </Panel>
  );
}
