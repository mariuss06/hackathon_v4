"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type {
  CompanyAssessment,
  InvestmentInput,
  LegalCheckResult,
  PortalSimulationScenario,
  QuizAnswers,
  QuizEvaluation,
} from "@/types/scoring";
import { loadCompanyAssessment } from "@/app/actions/loadCompany";
import { checkPortalJust } from "@/app/actions/checkPortalJust";
import {
  calculateFinalScore,
  evaluateFinancialQuiz,
  evaluateInvestment,
  FALLBACK_LEGAL_SCORE,
} from "@/lib/scoringEngine";
import { computeBusinessScore } from "@/services/businessScoreService";
import { simulateInvoiceUpload } from "@/services/eFacturaService";
import { Stepper } from "./Stepper";
import { StepCompany, type CompanyForm } from "./StepCompany";
import { EMPTY_QUIZ, StepFinancialQuiz } from "./StepFinancialQuiz";
import { StepInvestment } from "./StepInvestment";
import { ResultsDashboard, type UploadEvent } from "@/components/dashboard/ResultsDashboard";
import { DebugPanel } from "@/components/dashboard/DebugPanel";

const EMPTY_INVESTMENT: InvestmentInput = { purpose: null, ownContributionPct: 15, requestedAmount: null };

export function AssessmentWizard({ initialAssessment }: { initialAssessment: CompanyAssessment }) {
  const [assessment, setAssessment] = useState<CompanyAssessment>(initialAssessment);
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState<CompanyForm>({
    companyName: initialAssessment.groundTruth.companyName,
    ceoName: "",
    simulationMode: false,
    scenario: "clean",
  });
  const [answers, setAnswers] = useState<QuizAnswers>(EMPTY_QUIZ);
  const [investmentInput, setInvestmentInput] = useState<InvestmentInput>(EMPTY_INVESTMENT);
  const [frozenQuiz, setFrozenQuiz] = useState<QuizEvaluation | null>(null);
  const [legal, setLegal] = useState<LegalCheckResult | null>(null);
  const [legalLoading, setLegalLoading] = useState(false);
  const [lastUpload, setLastUpload] = useState<UploadEvent | null>(null);
  const legalRequestId = useRef(0);

  const loadData = useCallback(async () => {
    setAssessment(await loadCompanyAssessment(initialAssessment.groundTruth.companyId));
  }, [initialAssessment.groundTruth.companyId]);

  // ---- Legal check (runs in background while the user fills the quizzes) ----
  const runLegalCheck = useCallback(
    (opts: { companyName: string; ceoName: string; simulationMode: boolean; scenario: PortalSimulationScenario }) => {
      const id = ++legalRequestId.current;
      setLegalLoading(true);
      checkPortalJust({
        companyName: opts.companyName,
        ceoName: opts.ceoName,
        simulationMode: opts.simulationMode,
        simulationScenario: opts.scenario,
      })
        .catch(
          (): LegalCheckResult => ({
            query: { companyName: opts.companyName, ceoName: opts.ceoName },
            source: "fallback",
            isFallback: true,
            isSimulated: false,
            cases: [],
            totalFound: 0,
            excludedCount: 0,
            criticalCount: 0,
            totalDeduction: 0,
            minorCapApplied: false,
            legalScore: FALLBACK_LEGAL_SCORE,
            integrityKillSwitch: false,
            message: `Serverul aplicației nu a putut contacta portal.just.ro. Punctaj neutru ${FALLBACK_LEGAL_SCORE}/100.`,
            checkedAt: new Date().toISOString(),
          }),
        )
        .then((res) => {
          if (id !== legalRequestId.current) return; // stale response
          setLegal(res);
          setLegalLoading(false);
        });
    },
    [],
  );

  // ---- Derived scores (pure functions, recomputed live) ----
  const business = useMemo(
    () => computeBusinessScore(assessment.groundTruth, assessment.sBusinessMock),
    [assessment],
  );
  const investment = useMemo(
    () => evaluateInvestment(investmentInput, assessment.groundTruth.annualizedRevenue),
    [assessment, investmentInput],
  );
  const final = useMemo(
    () =>
      frozenQuiz && legal && !legalLoading
        ? calculateFinalScore(business.sBusiness, frozenQuiz.total, legal, investment.total)
        : null,
    [business, frozenQuiz, investment, legal, legalLoading],
  );

  // ---- Handlers ----
  const goToQuiz = () => {
    runLegalCheck(company);
    setStep(1);
  };

  const freezeQuiz = () => {
    setFrozenQuiz(evaluateFinancialQuiz(answers, assessment.groundTruth));
    setStep(2);
  };

  const handleUpload = () => {
    if (!frozenQuiz || !legal || !final) return;
    const { invoice, groundTruth } = simulateInvoiceUpload(assessment.groundTruth);
    const next = { ...assessment, groundTruth };
    const nextBusiness = computeBusinessScore(groundTruth, next.sBusinessMock);
    const nextInvestment = evaluateInvestment(investmentInput, groundTruth.annualizedRevenue);
    // frozenQuiz.total is reused as-is: new invoices never re-grade the quiz.
    const nextFinal = calculateFinalScore(nextBusiness.sBusiness, frozenQuiz.total, legal, nextInvestment.total);
    setLastUpload({
      invoice,
      businessDelta: nextBusiness.sBusiness - business.sBusiness,
      scoreDelta: nextFinal.finalScore - final.finalScore,
    });
    setAssessment(next);
  };

  const restart = async () => {
    await loadData();
    setStep(0);
    setAnswers(EMPTY_QUIZ);
    setInvestmentInput(EMPTY_INVESTMENT);
    setFrozenQuiz(null);
    setLegal(null);
    setLastUpload(null);
    legalRequestId.current++;
    setLegalLoading(false);
  };

  return (
    <div className="space-y-8">
      <div className="neu-raised rounded-[24px] px-5 py-4 sm:px-7">
        <Stepper current={step} />
      </div>

      {step === 0 && <StepCompany value={company} onChange={setCompany} onNext={goToQuiz} />}

      {step === 1 && (
        <StepFinancialQuiz
          truth={assessment.groundTruth}
          value={answers}
          onChange={setAnswers}
          onBack={() => setStep(0)}
          onSubmit={freezeQuiz}
        />
      )}

      {step === 2 && (
        <StepInvestment
          value={investmentInput}
          annualizedRevenue={assessment.groundTruth.annualizedRevenue}
          onChange={setInvestmentInput}
          onBack={() => setStep(1)}
          onSubmit={() => setStep(3)}
        />
      )}

      {step === 3 && frozenQuiz && (
        <ResultsDashboard
          truth={assessment.groundTruth}
          final={final}
          business={business}
          frozenQuiz={frozenQuiz}
          investment={investment}
          legal={legal}
          legalLoading={legalLoading}
          lastUpload={lastUpload}
          onUpload={handleUpload}
          onRetryLegal={() => runLegalCheck(company)}
          onRestart={restart}
          debugPanel={
            <DebugPanel
              assessment={assessment}
              business={business}
              onChange={setAssessment}
              onReevaluateQuiz={() => setFrozenQuiz(evaluateFinancialQuiz(answers, assessment.groundTruth))}
              onReset={async () => {
                await loadData();
                setLastUpload(null);
              }}
              simulationScenario={company.scenario}
              onRunSimulation={(scenario) => {
                const next = { ...company, simulationMode: true, scenario };
                setCompany(next);
                runLegalCheck(next);
              }}
              onRunLive={() => {
                const next = { ...company, simulationMode: false };
                setCompany(next);
                runLegalCheck(next);
              }}
            />
          }
        />
      )}
    </div>
  );
}
