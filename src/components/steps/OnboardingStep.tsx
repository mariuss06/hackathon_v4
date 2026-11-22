"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useAssessment } from "../AssessmentProvider";
import { useLanguage } from "../LanguageProvider";
import { CompanyForm } from "../CompanyForm";
import { LegalPanel } from "../LegalPanel";
import { BilantCard, FinancialsCard } from "../OfficialData";
import { PageHeader } from "../Shell";
import { UploadPanel } from "./AnalysisStep";

/**
 * Step 1 — all the INPUTS, in one place: company + administrator ("datele tale"),
 * e-Factura, and the official data pulled from ANAF. No quiz and no scores here.
 */
export function OnboardingStep() {
  const { pendingDraft, saveCompany, company, markVisited } = useAssessment();
  const router = useRouter();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => markVisited("onboarding"), [markVisited]);

  const go = async () => {
    setBusy(true);
    setNote(null);
    try {
      let hasCompany = Boolean(company.id && company.name && company.ceoName);
      if (pendingDraft) {
        const r = await saveCompany(pendingDraft);
        if (!r.ok) {
          setNote(r.message);
          return;
        }
        hasCompany = true;
      }
      if (!hasCompany) {
        setNote(t.onboarding.missing);
        return;
      }
      router.push("/quiz");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-rise">
      <PageHeader
        title={t.onboarding.title}
        subtitle={t.onboarding.subtitle}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <CompanyForm />

        <LegalPanel />
      </div>

      <div className="mt-5">
        <UploadPanel />
      </div>

      <div className="mt-5">
        <FinancialsCard />
      </div>

      <div className="mt-5">
        <BilantCard />
      </div>

      <div className="no-print mt-10 flex flex-col items-end gap-2">
        {pendingDraft && <p className="text-xs text-muted">{t.onboarding.autosave}</p>}
        <button
          type="button"
          onClick={go}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-navy px-6 py-3 text-sm font-medium text-white hover:bg-navy-2 disabled:opacity-60"
        >
          {busy && <LoaderCircle size={15} className="animate-spin" />}
          {t.onboarding.next} <ArrowRight size={15} />
        </button>
        {note && <p className="max-w-sm text-right text-xs font-medium text-red">{note}</p>}
      </div>
    </div>
  );
}
