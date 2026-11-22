"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Building, Building2, Check, ChevronDown, FlaskConical, LogOut, Store } from "lucide-react";
import { PLAN_TIERS, type PlanTier } from "@/lib/pricing";
import { DEMO_PLAN_COMPANIES } from "@/lib/demo";
import { useAssessment } from "./AssessmentProvider";
import { useAuth } from "./AuthProvider";
import { useLanguage } from "./LanguageProvider";
import { cx } from "./ui";

const PLAN_ICON: Record<PlanTier, typeof Store> = { starter: Store, pro: Building2, business: Building };

/** Starts the demo scenario of a plan from inside the flow: demo session + demo companies + final report. */
export function useStartDemo() {
  const { loadDemoPlan } = useAssessment();
  const { session, signInDemo } = useAuth();
  const router = useRouter();
  return (tier: PlanTier) => {
    if (!session) signInDemo();
    loadDemoPlan(tier);
    router.push("/profil");
  };
}

/** One card per plan scenario (used in the switcher popover and on the login page). */
export function DemoPlanList({ current, onPick, hrefFor }: { current?: PlanTier | null; onPick?: (t: PlanTier) => void; hrefFor?: (t: PlanTier) => string }) {
  const { t } = useLanguage();
  return (
    <ul className="grid gap-2">
      {PLAN_TIERS.map((tier) => {
        const p = t.demo.plans[tier];
        const Icon = PLAN_ICON[tier];
        const active = current === tier;
        const body = (
          <>
            <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl", active ? "bg-white/15 text-white" : "bg-emerald-soft text-emerald-strong")}>
              <Icon size={16} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold">{p.name}</span>
                <span className={cx("text-[11px] font-medium", active ? "text-white/70" : "text-muted")}>{p.tag}</span>
              </span>
              <span className={cx("mt-0.5 block text-[11px] leading-snug", active ? "text-white/70" : "text-muted")}>{p.text}</span>
            </span>
            {active ? (
              <span className="inline-flex shrink-0 items-center gap-1 self-center rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase">
                <Check size={11} strokeWidth={3} /> {t.demo.active}
              </span>
            ) : (
              <span className="shrink-0 self-center text-[11px] font-semibold text-emerald-strong">{t.demo.load} →</span>
            )}
          </>
        );
        const cls = cx(
          "flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors",
          active ? "border-navy bg-navy text-white" : "border-line bg-card text-ink hover:border-emerald/60",
        );
        return (
          <li key={tier}>
            {hrefFor ? (
              <Link href={hrefFor(tier)} onClick={() => onPick?.(tier)} className={cls}>
                {body}
              </Link>
            ) : (
              <button type="button" onClick={() => onPick?.(tier)} className={cls} data-demo-plan={tier}>
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "Demo Plan & Company Switcher": a discreet button in the flow header opening the 3 scenarios. */
export function DemoSwitcher() {
  const { demoPlan, isDemo, startNewCompany } = useAssessment();
  const { t } = useLanguage();
  const start = useStartDemo();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
          isDemo ? "border-navy/20 bg-navy-soft text-navy-3" : "border-line text-muted hover:border-line-strong hover:text-ink",
        )}
      >
        <FlaskConical size={12} aria-hidden />
        {t.demo.button}
        {isDemo && demoPlan && <span className="font-semibold">· {t.demo.plans[demoPlan].name}</span>}
        <ChevronDown size={12} aria-hidden className={cx("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t.demo.title}
          className="animate-rise absolute right-0 top-full z-40 mt-2 w-[min(380px,calc(100vw-2rem))] rounded-3xl border border-line bg-card p-4 shadow-pop"
        >
          <p className="text-sm font-semibold text-ink">{t.demo.title}</p>
          <p className="mb-3 mt-0.5 text-[11px] leading-relaxed text-muted">{t.demo.subtitle}</p>
          <DemoPlanList
            current={demoPlan}
            onPick={(tier) => {
              setOpen(false);
              start(tier);
            }}
          />
          {isDemo && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                startNewCompany();
                router.push("/onboarding");
              }}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-medium text-muted hover:border-line-strong hover:text-ink"
            >
              <LogOut size={12} /> {t.demo.exit}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Number of demo companies in a plan scenario. */
export const demoCompanyCount = (tier: PlanTier) => DEMO_PLAN_COMPANIES[tier].length;
