"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, RotateCcw } from "lucide-react";
import type { QuizKind } from "./AssessmentProvider";
import { useAssessment } from "./AssessmentProvider";
import { useLanguage } from "./LanguageProvider";
import { Button, Card, CardHeader, ProgressBar } from "./ui";

export interface QuizStep {
  key: string;
  answered: boolean;
  content: ReactNode;
}

type Phase = "idle" | "in_progress" | "completed";

/** One quiz shown one question at a time: idle → in_progress → completed (saved, with the result). */
export function SequentialQuiz({
  kind,
  icon,
  title,
  subtitle,
  intro,
  steps,
  result,
  className = "mt-5",
}: {
  className?: string;
  kind: QuizKind;
  icon: ReactNode;
  title: string;
  subtitle: string;
  intro?: ReactNode;
  steps: QuizStep[];
  result: ReactNode;
}) {
  const { quizCompleted, completeQuiz } = useAssessment();
  const { t } = useLanguage();
  const sq = t.quiz.seq;
  const saved = quizCompleted[kind];
  const [phase, setPhase] = useState<Phase>(saved ? "completed" : "idle");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Saved state restored later (localStorage hydration, company switch) opens the result directly.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror the saved flag of the active company
    setPhase((p) => (saved ? (p === "in_progress" ? p : "completed") : p === "completed" ? "idle" : p));
  }, [saved]);

  const n = steps.length;
  const step = steps[currentQuestionIndex];
  const last = currentQuestionIndex === n - 1;

  const finish = async () => {
    setSaving(true);
    setNote(await completeQuiz(kind, true));
    setSaving(false);
    setPhase("completed");
  };
  const redo = () => {
    void completeQuiz(kind, false);
    setNote(null);
    setCurrentQuestionIndex(0);
    setPhase("in_progress");
  };

  return (
    <Card className={className}>
      <CardHeader icon={icon} title={title} subtitle={subtitle} />
      {intro}

      {phase === "idle" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas p-5">
          <p className="min-w-0 flex-1 text-sm text-muted">{sq.intro(n)}</p>
          <Button
            onClick={() => {
              setCurrentQuestionIndex(0);
              setPhase("in_progress");
            }}
          >
            {sq.start} <ArrowRight size={14} />
          </Button>
        </div>
      )}

      {phase === "in_progress" && step && (
        <div>
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted">
              {sq.question(currentQuestionIndex + 1, n)}
            </p>
            <ProgressBar value={((currentQuestionIndex + 1) / n) * 100} tone="navy" className="mt-1.5" />
          </div>
          <div key={step.key}>{step.content}</div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setCurrentQuestionIndex((i) => i - 1)} disabled={currentQuestionIndex === 0}>
              <ArrowLeft size={14} /> {t.common.back}
            </Button>
            {last ? (
              <Button onClick={finish} disabled={!step.answered || saving}>
                {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} {sq.finish}
              </Button>
            ) : (
              <Button onClick={() => setCurrentQuestionIndex((i) => i + 1)} disabled={!step.answered}>
                {sq.next} <ArrowRight size={14} />
              </Button>
            )}
          </div>
        </div>
      )}

      {phase === "completed" && (
        <div>
          {result}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={redo}>
              <RotateCcw size={14} /> {sq.redo}
            </Button>
            {note && <span className="text-xs font-medium text-navy-3">{note}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}
