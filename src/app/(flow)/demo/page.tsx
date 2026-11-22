"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, LoaderCircle } from "lucide-react";
import { useAssessment } from "@/components/AssessmentProvider";
import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { isPlanTier, type PlanTier } from "@/lib/pricing";

/**
 * /demo?plan=starter|pro|business — shareable Instant Demo entry (landing page, login page, links for evaluators).
 * Starts the simulated demo session (unless a real account is signed in), loads the plan's demo companies
 * and opens the final report. Unknown plans fall back to Pro.
 */
export default function DemoPage() {
  const { hydrated, loadDemoPlan } = useAssessment();
  const { loading, session, signInDemo } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (!hydrated || loading || started.current) return;
    started.current = true;
    const p = new URLSearchParams(window.location.search).get("plan");
    const tier: PlanTier = isPlanTier(p) ? p : "pro";
    if (!session) signInDemo();
    loadDemoPlan(tier);
    router.replace("/profil");
  }, [hydrated, loading, session, signInDemo, loadDemoPlan, router]);

  return (
    <div className="mx-auto grid max-w-md place-items-center py-16 text-center" role="status" aria-live="polite">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-navy-soft text-navy-3">
        <FlaskConical size={20} />
      </span>
      <h1 className="mt-4 text-xl font-medium text-ink">{t.demo.loading}</h1>
      <p className="mt-1.5 text-sm text-muted">{t.demo.loadingText}</p>
      <LoaderCircle size={20} className="mt-5 animate-spin text-faint" />
    </div>
  );
}
