"use client";

import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { INVESTMENT_PURPOSES } from "@/lib/scoringEngine";
import { useAssessment } from "../AssessmentProvider";
import { useLanguage } from "../LanguageProvider";
import { SequentialQuiz } from "../SequentialQuiz";
import { GatedFooter, PageHeader, StepDoneNote } from "../Shell";
import { cx, inputCls } from "../ui";

/**
 * Step 3 — the investment quiz: what the financing is for, how much own contribution and how much
 * is requested. No points, no DSCR, no sector benchmark are shown here: the analysis of these
 * answers appears only in the final report.
 */
export function InvestmentStep() {
  const { investment, setInvestment, markVisited, completedSteps, quizCompleted } = useAssessment();
  const { t, fmt } = useLanguage();
  const iv = t.investment;
  const [amountText, setAmountText] = useState(investment.requestedAmount ? fmt.number(investment.requestedAmount) : "");
  useEffect(() => markVisited("investitie"), [markVisited]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror external changes (demo fill) into the text input
    setAmountText(investment.requestedAmount ? fmt.number(investment.requestedAmount) : "");
  }, [investment.requestedAmount, fmt]);

  const own = investment.ownContributionPct;

  return (
    <div className="animate-rise">
      <PageHeader
        title={iv.title}
        subtitle={iv.subtitle}
      />

      <SequentialQuiz
        kind="investment"
        className="mt-5"
        icon={<Target size={18} />}
        title={iv.cardTitle}
        subtitle={iv.cardSubtitle}
        steps={[
          {
            key: "purpose",
            answered: investment.purpose != null,
            content: (
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">{iv.q1}</p>
                <div role="radiogroup" aria-label={iv.q1Aria} className="grid gap-2 sm:grid-cols-2">
                  {INVESTMENT_PURPOSES.map((p) => {
                    const active = investment.purpose === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setInvestment({ purpose: p.value })}
                        className={cx("rounded-xl border p-3.5 text-left transition-colors", active ? "border-navy bg-navy text-white" : "border-line-strong bg-white hover:border-navy-3")}
                      >
                        <span className="block text-sm font-semibold">{iv.purposes[p.value]?.label ?? p.label}</span>
                        <span className={cx("mt-0.5 block text-xs", active ? "text-white/70" : "text-muted")}>{iv.purposes[p.value]?.hint ?? p.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ),
          },
          {
            key: "own",
            answered: own != null,
            content: (
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">{iv.q2}</p>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={1}
                    value={own ?? 0}
                    onChange={(e) => setInvestment({ ownContributionPct: Number(e.target.value) })}
                    className="min-w-0 flex-1"
                    aria-label={iv.q2Aria}
                  />
                  <div className="relative w-24 shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className={cx(inputCls, "pr-7 text-right font-semibold")}
                      value={own ?? ""}
                      placeholder="—"
                      onChange={(e) => setInvestment({ ownContributionPct: e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value))) })}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-faint">%</span>
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-muted">{iv.q2Hint}</p>
              </div>
            ),
          },
          {
            key: "amount",
            answered: (investment.requestedAmount ?? 0) > 0,
            content: (
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">{iv.q3}</p>
                <div className="relative">
                  <input
                    inputMode="numeric"
                    className={cx(inputCls, "pr-14 text-base font-semibold")}
                    placeholder={iv.q3Placeholder}
                    value={amountText}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      setAmountText(digits ? fmt.number(Number(digits)) : "");
                      setInvestment({ requestedAmount: digits ? Number(digits) : null });
                    }}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-faint">RON</span>
                </div>
                <p className="mt-2 text-[11px] text-muted">{iv.q3Hint}</p>
              </div>
            ),
          },
        ]}
        result={<StepDoneNote text={t.quiz.done} />}
      />

      <GatedFooter
        prev="/quiz"
        next="/profil"
        label={iv.next}
        error={!completedSteps.step2 ? iv.errPrev : !quizCompleted.investment ? iv.errQuiz : null}
      />
    </div>
  );
}
