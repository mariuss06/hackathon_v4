"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Building2, Check, ClipboardCheck, FileUp, FlaskConical, Home, ListChecks, LoaderCircle, Lock, RotateCcw, ShieldCheck, Tag, Target, X } from "lucide-react";
import { isDemoCompanyId } from "@/lib/demo";
import { LanguageToggle, useLanguage } from "./LanguageProvider";
import { DemoSwitcher } from "./DemoSwitcher";
import { tr } from "@/lib/i18n/tr";
import { useHideScores } from "@/lib/useHideScores";
import { BrandLogo } from "./BrandLogo";
import { useAuth } from "./AuthProvider";
import { AccountButtons } from "./AccountButtons";
import { HomeFooter } from "./home/HomeFooter";
import { HomeNav } from "./home/HomeNav";
import { useAssessment } from "./AssessmentProvider";
import { Figure } from "./charts";
import { Button, cx } from "./ui";
import { PlanBadge, UpgradePrompt } from "./PlanGate";
import { companyLabel } from "@/lib/company";
import { num } from "@/lib/util";

export { AccountButtons };

/**
 * The 4 stages of the sequential flow. The data analysis (e-Factura, ANAF, benchmark) runs
 * automatically in the background — it is not a page — and is revealed only in the final stage.
 */
export const STEPS: { id: "onboarding" | "quiz" | "investitie" | "profil"; href: string; icon: ReactNode }[] = [
  { id: "onboarding", href: "/onboarding", icon: <Building2 size={16} /> },
  { id: "quiz", href: "/quiz", icon: <ListChecks size={16} /> },
  { id: "investitie", href: "/investitie", icon: <Target size={16} /> },
  { id: "profil", href: "/profil", icon: <ClipboardCheck size={16} /> },
];

/** Step completion + access: step i opens only when every step before it is complete. */
function useSteps() {
  const { completedSteps: c, visited } = useAssessment();
  const completed = [c.step1, c.step2, c.step3];
  // The final step only gets its check mark once the report has actually been opened.
  const done = (i: number) => (i === 3 ? Boolean(completed[2]) && visited.includes("profil") : Boolean(completed[i]));
  const unlocked = (i: number) => i === 0 || Boolean(completed[i - 1]);
  const firstIncomplete = !c.step1 ? "/onboarding" : !c.step2 ? "/quiz" : !c.step3 ? "/investitie" : "/profil";
  return { done, unlocked, firstIncomplete, count: completed.filter(Boolean).length };
}

/** Route guard: a later step opened by URL redirects to the first incomplete step. */
function useStepGuard() {
  const path = usePathname();
  const router = useRouter();
  const { hydrated } = useAssessment();
  const { unlocked, firstIncomplete } = useSteps();
  // Pages that are not part of the sequential flow (/pricing, /termeni, /confidentialitate, …)
  // are public: they must never bounce the user back into the flow.
  const stepIndex = STEPS.findIndex((s) => path.startsWith(s.href));
  const allowed = stepIndex === -1 ? true : unlocked(stepIndex);
  useEffect(() => {
    if (hydrated && !allowed) router.replace(firstIncomplete);
  }, [hydrated, allowed, firstIncomplete, router]);
  return allowed || !hydrated;
}

function StepChip({ s, i, className, children }: { s: (typeof STEPS)[number]; i: number; className: string; children: ReactNode }) {
  const { unlocked } = useSteps();
  const { t } = useLanguage();
  if (!unlocked(i)) {
    return (
      <span aria-disabled="true" title={t.shell.finishPrevious} className={cx(className, "cursor-not-allowed opacity-45")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={s.href} className={className}>
      {children}
    </Link>
  );
}

/**
 * Minimal top tracker — replaces the old sidebar. It only answers "how many steps are left
 * until the complete evaluation" and never shows points or scores before the final report.
 */
function ProgressTracker() {
  const path = usePathname();
  const { done, unlocked, count } = useSteps();
  const { isAdmin } = useAuth();
  const { t } = useLanguage();
  const atFinal = path.startsWith("/profil");
  const reportSeen = done(3);
  const remainingSteps = Math.max(0, 3 - count);
  const message = atFinal || reportSeen ? t.shell.reportReady : t.shell.stepsLeft(remainingSteps);

  return (
    <header className="no-print sticky top-0 z-30 border-b border-line/80 bg-card/85 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[1240px] px-4 pt-2.5 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label={t.nav.homeAria} className="shrink-0">
            <BrandLogo size="sm" />
          </Link>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <LanguageToggle />
            {/* Always available from every flow step: return to the marketing home page. */}
            <Link
              href="/"
              title={t.nav.backHome}
              aria-label={t.nav.backHome}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <Home size={11} /> <span className="hidden sm:inline">{t.nav.home}</span>
            </Link>
            <Link
              href="/pricing"
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
                path.startsWith("/pricing") ? "bg-navy text-white" : "border border-line text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              <Tag size={11} /> <span className="hidden sm:inline">{t.nav.pricingShort}</span>
            </Link>
            {isAdmin && (
              <Link href="/admin" className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[11px] font-medium text-muted hover:border-line-strong hover:text-ink">
                <ShieldCheck size={11} /> {t.nav.admin}
              </Link>
            )}
          </div>
        </div>

        <div className="pb-2.5 pt-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className={cx("text-xs font-medium", atFinal || reportSeen ? "text-emerald-strong" : "text-ink")}>{message}</p>
            <p className="shrink-0 text-[11px] text-faint">{t.shell.stepOf(Math.min(4, count + 1))}</p>
          </div>

          {/* Segmented progress bar: one segment per stage. */}
          <div className="mt-1.5 flex gap-1.5" role="presentation">
            {STEPS.map((s, i) => {
              const ok = done(i);
              const active = path.startsWith(s.href);
              return (
                <span
                  key={s.id}
                  title={`${t.shell.steps[s.id].label}${ok ? t.shell.done : ""}`}
                  className={cx("h-1.5 flex-1 rounded-full transition-colors", ok ? "bg-emerald" : active ? "bg-navy/70" : "bg-line-strong")}
                />
              );
            })}
          </div>

          <nav aria-label={t.shell.stepsAria} className="mt-2 flex flex-wrap items-center gap-1">
            {STEPS.map((s, i) => {
              const ok = done(i);
              const active = path.startsWith(s.href);
              const locked = !unlocked(i);
              return (
                <StepChip
                  key={s.id}
                  s={s}
                  i={i}
                  className={cx(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors",
                    active ? "bg-navy text-white" : ok ? "text-emerald-strong hover:bg-emerald-soft" : locked ? "text-faint" : "text-muted hover:bg-canvas hover:text-ink",
                  )}
                >
                  <span className="grid h-3.5 w-3.5 place-items-center">
                    {ok ? <Check size={11} strokeWidth={3} /> : locked ? <Lock size={9} /> : <span className="text-[10px] font-semibold">{i + 1}</span>}
                  </span>
                  {t.shell.steps[s.id].short}
                </StepChip>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}

/** Visible "upload e-Factura" button, available on every step. */
export function XmlUploadButton({ variant = "emerald", label }: { variant?: "emerald" | "primary" | "secondary"; label?: string }) {
  const { uploadXml } = useAssessment();
  const { t } = useLanguage();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".xml,text/xml,application/xml"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          try {
            await uploadXml(await Promise.all(files.map(async (f) => ({ name: f.name, xml: await f.text() }))));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button variant={variant} onClick={() => ref.current?.click()} disabled={busy} title={t.shell.uploadTitle}>
        {busy ? <LoaderCircle size={15} className="animate-spin" /> : <FileUp size={15} />}
        {label ?? t.shell.uploadXml}
      </Button>
    </>
  );
}

/** "Firmă activă / Istoric firme": every saved company stays available; switching never deletes data. */
function CompanySwitcher() {
  const { company, companies, switchCompany, assessment, dataset, isDemo } = useAssessment();
  const { t } = useLanguage();
  // Demo mode lists only the scenario's demo companies; real mode never lists demo companies.
  const sorted = companies.filter((c) => isDemoCompanyId(c.id) === isDemo).sort((a, b) => a.name.localeCompare(b.name, "ro"));
  const docs = assessment.metrics.issuedCount + assessment.metrics.receivedCount;
  return (
    <div className="min-w-0 max-w-full flex-1 basis-[280px]">
      <label className="flex min-w-0 items-center gap-2">
        <Building2 size={15} className="shrink-0 text-faint" />
        <span className="sr-only">{t.shell.activeCompany}</span>
        <select
          className="min-w-0 max-w-[min(420px,calc(100vw-5rem))] truncate rounded-full border border-line bg-white/80 py-1.5 pl-3 pr-8 text-sm font-medium text-ink outline-none hover:border-line-strong focus:border-navy-3"
          value={company.id}
          onChange={(e) => switchCompany(e.target.value)}
          title={t.shell.switchTitle}
        >
          {sorted.length === 0 && <option value="">{t.shell.noCompany}</option>}
          {sorted.map((c) => (
            <option key={c.id} value={c.id}>
              {companyLabel(c)}
            </option>
          ))}
        </select>
        <span className="hidden shrink-0 text-[11px] text-faint sm:inline">{t.common.companiesCount(sorted.length)}</span>
      </label>
      <p className="mt-1 truncate pl-6 text-[11px] text-faint" title={company.name}>
        {company.cui ? `CUI ${company.cui}` : t.common.noCui} · {company.caenCode ? `CAEN ${company.caenCode}` : t.common.noCaen} · {t.shell.sector} {tr(assessment.benchmark.sector.shortLabel)} ·{" "}
        {docs} {t.shell.documents} ({dataset.source === "supabase" ? t.shell.sourceSupabase : t.shell.sourceUploaded})
        {docs > 0 ? ` · ${t.shell.until} ${assessment.metrics.asOf}` : ""}
      </p>
    </div>
  );
}

/** Demo switcher lives in ./DemoSwitcher (3 plan scenarios). */
function TopBar() {
  const { uploads, resetUploads, isDemo } = useAssessment();
  const { t } = useLanguage();
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 pb-3 pt-4">
      <CompanySwitcher />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <AccountButtons />
        <PlanBadge />
        <DemoSwitcher />
        {uploads.length > 0 && !isDemo && (
          <Button variant="secondary" onClick={resetUploads} title={t.shell.removeUploads}>
            <RotateCcw size={14} /> {uploads.length} XML
          </Button>
        )}
        <XmlUploadButton />
      </div>
    </div>
  );
}

function ScoreToastView() {
  const { toast, dismissToast } = useAssessment();
  const { t } = useLanguage();
  const hideScores = useHideScores();
  if (!toast || hideScores) return null;
  const delta = Math.round((toast.to - toast.from) * 10) / 10;
  const up = delta >= 0;
  return (
    <div role="status" key={toast.id} className="no-print animate-rise fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-[22px] bg-navy p-5 text-white shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] text-white/45">{t.shell.scoreRecalculated}</p>
          <p className="mt-1 text-sm font-medium">{toast.title}</p>
          <p className="text-xs text-white/55">{toast.detail}</p>
        </div>
        <button type="button" onClick={dismissToast} aria-label={t.common.close} className="text-white/40 hover:text-white">
          <X size={16} />
        </button>
      </div>
      <div className="mt-4 flex items-baseline gap-3">
        <span className="text-xl font-light text-white/45">{num(toast.from)}</span>
        <ArrowRight size={14} className="self-center text-white/30" />
        <span className="text-3xl font-light tracking-tight">
          <Figure value={num(toast.to)} />
        </span>
        <span className={cx("ml-auto inline-flex items-center gap-1 self-center rounded-full px-2.5 py-1 text-xs", up ? "bg-white/10 text-[#9fd1b3]" : "bg-white/10 text-[#e8a9a4]")}>
          {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {up ? "+" : ""}
          {num(delta)}
        </span>
      </div>
    </div>
  );
}

/** Discreet banner while the demo company is active. */
function DemoBanner() {
  const { isDemo, startNewCompany, demoPlan, companies } = useAssessment();
  const { t } = useLanguage();
  const router = useRouter();
  if (!isDemo || !demoPlan) return null;
  const n = companies.filter((c) => isDemoCompanyId(c.id)).length;
  return (
    <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-navy/15 bg-navy-soft/60 px-4 py-2.5 text-xs text-ink">
      <p className="flex items-center gap-2">
        <FlaskConical size={14} className="shrink-0 text-navy-3" />
        <span>
          <strong>{t.shell.demoActive}</strong> — {t.shell.demoActiveText(t.demo.plans[demoPlan].name, n)}
        </span>
      </p>
      <button
        type="button"
        onClick={() => {
          startNewCompany();
          router.push("/onboarding");
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 font-medium hover:border-line-strong"
      >
        <RotateCcw size={12} /> {t.shell.exitDemo}
      </button>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { hydrated } = useAssessment();
  const allowed = useStepGuard();
  const isFlowStep = STEPS.some((s) => path.startsWith(s.href));

  // Public pages (/pricing, /pricing/business, /termeni, /confidentialitate) are NOT part of the
  // onboarding flow: they get the marketing header/footer instead of the step tracker and company bar.
  if (!isFlowStep) {
    return (
      <div className="flex min-h-screen flex-col">
        <HomeNav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8">{children}</main>
        <HomeFooter />
        <UpgradePrompt />
      </div>
    );
  }

  return (
    <div className={cx("min-h-screen transition-opacity duration-200", hydrated ? "opacity-100" : "opacity-0")}>
      <ProgressTracker />
      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6">
        <TopBar />
        <main className="pb-10">
          <DemoBanner />
          {allowed ? children : null}
        </main>
      </div>
      <ScoreToastView />
      <UpgradePrompt />
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="break-words text-[26px] font-normal leading-tight tracking-tight text-ink sm:text-[34px]">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

/** Neutral confirmation shown in steps 1-3 instead of a score. */
export function StepDoneNote({ text }: { text?: string }) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-emerald/30 bg-emerald-soft px-4 py-3 text-sm font-medium text-emerald-strong">
      <Check size={16} strokeWidth={2.5} className="shrink-0" /> {text ?? t.shell.stepDone}
    </div>
  );
}

/** "Continuă" that validates the current step first; the error is shown under the button. */
export function GatedFooter({ prev, next, label, error, onContinue }: { prev?: string; next: string; label: string; error: string | null; onContinue?: () => void }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="no-print mt-10 flex items-start justify-between gap-3">
      {prev ? (
        <Link href={prev} className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-muted hover:bg-white/70 hover:text-ink">
          <ArrowLeft size={15} /> {t.common.back}
        </Link>
      ) : (
        <span />
      )}
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => {
            if (error) return setNote(error);
            setNote(null);
            onContinue?.();
            router.push(next);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-navy px-6 py-3 text-sm font-medium text-white hover:bg-navy-2"
        >
          {label} <ArrowRight size={15} />
        </button>
        {note && <p className="max-w-xs text-right text-xs font-medium text-red">{note}</p>}
      </div>
    </div>
  );
}

export function StepFooter({ prev, next, nextLabel }: { prev?: string; next?: string; nextLabel?: string }) {
  const { t } = useLanguage();
  return (
    <div className="no-print mt-10 flex items-center justify-between gap-3">
      {prev ? (
        <Link href={prev} className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-muted hover:bg-white/70 hover:text-ink">
          <ArrowLeft size={15} /> {t.common.back}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={next} className="inline-flex items-center gap-2 rounded-full bg-navy px-6 py-3 text-sm font-medium text-white hover:bg-navy-2">
          {nextLabel ?? t.common.continue} <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}
