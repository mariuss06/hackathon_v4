"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ListChecks, LoaderCircle, Sparkles } from "lucide-react";
import { CLIENT_SHARE_BUCKETS, PAYMENT_TERM_BUCKETS, quizTruthFromMetrics, supplierOptions } from "@/lib/scoringEngine";
import { useAssessment } from "../AssessmentProvider";
import { useLanguage } from "../LanguageProvider";
import { tr } from "@/lib/i18n/tr";
import { SequentialQuiz } from "../SequentialQuiz";
import { PageHeader, StepDoneNote } from "../Shell";
import { cx, inputCls, Segmented } from "../ui";
import { ProgressBar } from "../ui";

/** One numbered question. Deliberately shows NO points and no score rules. */
function QuestionShell({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="mb-3 text-sm font-semibold text-ink">
        <span className="mr-2 text-faint">{n}.</span>
        {title}
      </p>
      {children}
    </div>
  );
}

/** The automatic analysis between quiz 1 and quiz 2: shows what is computed, never a score. */
function AutoAnalysisOverlay() {
  const { t } = useLanguage();
  const ANALYSIS_STEPS = t.quiz.analysisSteps;
  const [done, setDone] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setDone((d) => (d < 4 ? d + 1 : d)), 620);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="no-print fixed inset-0 z-50 grid place-items-center bg-navy/45 p-4 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="animate-rise w-full max-w-md rounded-3xl bg-card p-6 shadow-pop">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-strong">
          <Sparkles size={14} /> {t.quiz.analysisEyebrow}
        </p>
        <h2 className="mt-1 text-xl font-medium text-ink">{t.quiz.analysisTitle}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {t.quiz.analysisText}
        </p>
        <ProgressBar value={(done / ANALYSIS_STEPS.length) * 100} tone="navy" className="mt-4" />
        <ul className="mt-4 space-y-2.5">
          {ANALYSIS_STEPS.map((s, i) => (
            <li key={s} className="flex items-start gap-2.5 text-sm">
              <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", i < done ? "bg-emerald-soft text-emerald-strong" : "border border-line-strong text-faint")}>
                {i < done ? <Check size={12} strokeWidth={3} /> : <LoaderCircle size={11} className={cx(i === done && "animate-spin")} />}
              </span>
              <span className={cx("leading-snug", i < done ? "text-ink" : "text-muted")}>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Step 2 — the financial-knowledge quiz about the company. Answers are validated automatically
 * against the e-Factura data; the result is never shown here, it only feeds the final report.
 */
export function QuizStep() {
  const { quiz, setQuiz, assessment, markVisited, quizCompleted } = useAssessment();
  const truth = quizTruthFromMetrics(assessment.metrics);
  const router = useRouter();
  const { t, fmt } = useLanguage();
  const q = t.quiz;
  const [revenueText, setRevenueText] = useState(quiz.revenueEstimate ? fmt.number(quiz.revenueEstimate) : "");
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => markVisited("quiz"), [markVisited]);
  // Keep the formatted text in sync when answers change elsewhere (demo).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror external changes into the text input
    setRevenueText(quiz.revenueEstimate ? fmt.number(quiz.revenueEstimate) : "");
  }, [quiz.revenueEstimate, fmt]);

  const startAnalysis = () => {
    setAnalyzing(true);
    // The analysis itself is already computed live by AssessmentProvider; the overlay only
    // communicates the automatic step before the second quiz.
    window.setTimeout(() => router.push("/investitie"), 2900);
  };

  return (
    <div className="animate-rise">
      {analyzing && <AutoAnalysisOverlay />}
      <PageHeader
        title={q.title}
        subtitle={q.subtitle}
      />

      <SequentialQuiz
        kind="quiz"
        icon={<ListChecks size={18} />}
        title={q.cardTitle}
        subtitle={q.cardSubtitle}
        intro={
          !assessment.dataStatus.hasInvoices && (
            <p className="mb-4 rounded-xl bg-amber-soft px-4 py-3 text-xs font-medium text-amber">
              {q.noInvoices}
            </p>
          )
        }
        steps={[
          {
            key: "revenue",
            answered: quiz.revenueEstimate != null,
            content: (
              <QuestionShell n={1} title={q.q1}>
                <div className="relative">
                  <input
                    inputMode="numeric"
                    className={cx(inputCls, "pr-14 text-base font-semibold")}
                    placeholder={q.q1Placeholder}
                    value={revenueText}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      setRevenueText(digits ? fmt.number(Number(digits)) : "");
                      setQuiz({ revenueEstimate: digits ? Number(digits) : null });
                    }}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-faint">RON</span>
                </div>
                <p className="mt-2 text-[11px] text-muted">{q.q1Hint}</p>
              </QuestionShell>
            ),
          },
          {
            key: "term",
            answered: quiz.paymentTerm != null,
            content: (
              <QuestionShell n={2} title={q.q2}>
                <Segmented
                  name={q.q2}
                  options={PAYMENT_TERM_BUCKETS.map((o) => ({ ...o, label: q.paymentTerms[o.value] ?? o.label }))}
                  value={quiz.paymentTerm}
                  onChange={(v) => setQuiz({ paymentTerm: v })}
                />
                <p className="mt-2 text-[11px] text-muted">{q.q2Hint}</p>
              </QuestionShell>
            ),
          },
          {
            key: "share",
            answered: quiz.topClientShare != null,
            content: (
              <QuestionShell n={3} title={q.q3}>
                <Segmented
                  name={q.q3}
                  options={CLIENT_SHARE_BUCKETS.map((o) => ({ ...o, label: q.clientShares[o.value] ?? o.label }))}
                  value={quiz.topClientShare}
                  onChange={(v) => setQuiz({ topClientShare: v })}
                />
                <p className="mt-2 text-[11px] text-muted">{q.q3Hint}</p>
              </QuestionShell>
            ),
          },
          {
            key: "supplier",
            answered: Boolean(quiz.mainSupplier),
            content: (
              <QuestionShell n={4} title={q.q4}>
                <div role="radiogroup" aria-label={q.supplierAria} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {supplierOptions(truth).map((name) => (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={quiz.mainSupplier === name}
                      onClick={() => setQuiz({ mainSupplier: name })}
                      className={cx(
                        "min-w-0 break-words rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                        quiz.mainSupplier === name ? "border-navy bg-navy text-white" : "border-line-strong bg-white hover:border-navy-3",
                      )}
                    >
                      {tr(name)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted">{q.q4Hint}</p>
              </QuestionShell>
            ),
          },
          {
            key: "credit-notes",
            answered: quiz.hasSignificantCreditNotes !== null,
            content: (
              <QuestionShell n={5} title={q.q5}>
                <Segmented
                  name={q.q5}
                  options={[
                    { value: "da", label: t.common.yes },
                    { value: "nu", label: t.common.no },
                  ]}
                  value={quiz.hasSignificantCreditNotes === null ? null : quiz.hasSignificantCreditNotes ? "da" : "nu"}
                  onChange={(v) => setQuiz({ hasSignificantCreditNotes: v === "da" })}
                />
                <p className="mt-2 text-[11px] text-muted">{q.q5Hint}</p>
              </QuestionShell>
            ),
          },
        ]}
        result={<StepDoneNote text={q.done} />}
      />

      {quizCompleted.quiz && (
        <div className="no-print mt-10 flex flex-col items-end gap-2">
          <p className="text-xs text-muted">{q.nextNote}</p>
          <button
            type="button"
            onClick={startAnalysis}
            className="inline-flex items-center gap-2 rounded-full bg-navy px-6 py-3 text-sm font-medium text-white hover:bg-navy-2"
          >
            {q.next} <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
