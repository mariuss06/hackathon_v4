"use client";

import Link from "next/link";
import { ArrowRight, Check, FlaskConical, ShieldCheck } from "lucide-react";
import { cx } from "@/components/ui";
import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";

export function HeroSection() {
  const { t } = useLanguage();
  const { session, signInDemo } = useAuth();
  const h = t.home.hero;
  return (
    <section aria-labelledby="home-hero-title" className="relative overflow-hidden border-b border-line bg-[linear-gradient(180deg,var(--card)_0%,var(--canvas)_100%)]">
      {/* Discreet dotted texture, like the reference hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ backgroundImage: "radial-gradient(var(--line-strong) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
      />

      <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-10 sm:px-6 lg:px-8 lg:pb-20 lg:pt-16">
        <div className="mb-6 flex flex-wrap items-center justify-center gap-2.5 xl:justify-start">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-emerald-soft px-3 py-1 text-xs font-medium text-emerald-strong">
            <ShieldCheck size={14} aria-hidden />
            {h.badge}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-soft px-2.5 py-1 text-xs font-medium text-emerald-strong">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald" />
            {h.compatible}
          </span>
        </div>

        <div className="grid grid-cols-1 items-center gap-10 xl:grid-cols-12 xl:gap-12">
          {/* Left: message + conversion */}
          <div className="min-w-0 text-center xl:col-span-7 xl:text-left">
            <h1 id="home-hero-title" className="text-balance text-3xl font-bold leading-[1.15] tracking-tight text-ink sm:text-4xl lg:text-[46px]">
              {h.titleA}
              <span className="text-emerald-strong">{h.titleHighlight}</span>
              {h.titleB}
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg xl:mx-0">
              {h.lead}
              <strong className="font-medium text-ink">{h.leadStrong}</strong>.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3.5 sm:flex-row sm:flex-wrap xl:justify-start">
              <Link
                href="/onboarding"
                className="group flex w-full items-center justify-center gap-2.5 rounded-full bg-navy px-7 py-4 text-sm font-semibold text-white shadow-card transition-colors hover:bg-navy-2 sm:w-auto sm:text-base"
              >
                <span>{h.ctaStart}</span>
                <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 transition-transform group-hover:translate-x-0.5">
                  <ArrowRight size={14} />
                </span>
              </Link>

              <Link
                href="/pricing"
                className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-card px-6 py-4 text-sm font-medium text-ink transition-colors hover:bg-canvas sm:w-auto sm:text-base"
              >
                <span>{h.ctaPricing}</span>
              </Link>
            </div>

            {/* Instant Demo Login: simulated session + Pro scenario (3 companies), straight to the report. */}
            <div className="mt-4 flex flex-col items-center gap-1 xl:items-start">
              <Link
                href="/demo?plan=pro"
                onClick={() => {
                  if (!session) signInDemo();
                }}
                className="inline-flex items-center gap-2 rounded-full border border-dashed border-navy/25 bg-navy-soft/60 px-4 py-2 text-xs font-semibold text-navy-3 transition-colors hover:border-navy/50 hover:text-ink sm:text-sm"
              >
                <FlaskConical size={14} aria-hidden /> {h.ctaDemo}
              </Link>
              <span className="text-[11px] text-faint">{h.ctaDemoHint}</span>
            </div>
          </div>

          {/* Right: preview card mirroring the in-app analysis panel */}
          <div className="mx-auto w-full min-w-0 max-w-xl xl:col-span-5 xl:max-w-none">
            <div className="rounded-3xl border border-line bg-card p-5 shadow-card sm:p-6">
              <div className="flex items-center justify-between gap-2 border-b border-line pb-4">
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald" />
                  <span className="truncate text-xs font-semibold text-ink">NORD FRESH DISTRIBUȚIE SRL</span>
                  <span className="hidden text-[11px] text-muted sm:inline">· RO40000001</span>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-soft px-2.5 py-0.5 text-[11px] font-semibold text-emerald-strong">Plan: PRO</span>
              </div>

              <div className="grid grid-cols-1 items-center gap-5 py-5 sm:grid-cols-12">
                {/* Decorative example gauge — NOT the visitor's score */}
                <div className="flex flex-col items-center justify-center rounded-2xl border border-line/70 bg-canvas p-4 sm:col-span-5">
                  <div className="mb-1 flex w-full items-center justify-between gap-2 text-[11px]">
                    <span className="truncate font-medium text-muted">{h.exampleReport}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 font-medium text-emerald-strong">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald" /> {h.demoTag}
                    </span>
                  </div>
                  <div className="relative my-1 flex h-32 w-32 items-center justify-center">
                    <svg aria-hidden viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                      <circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" strokeWidth="8" />
                      <circle cx="60" cy="60" r="50" fill="none" stroke="var(--emerald)" strokeWidth="8" strokeLinecap="round" strokeDasharray="314.16" strokeDashoffset="86" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <div className="text-2xl font-bold tracking-tight text-ink">
                        72<span className="font-normal text-muted">{t.meta.locale === "ro-RO" ? ",6" : ".6"}</span>
                      </div>
                      <span className="text-[11px] text-muted">{h.outOf100}</span>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-soft px-2.5 py-0.5 text-center text-[11px] font-medium text-emerald-strong">{h.eligibility}</span>
                </div>

                {/* The 4 sequential stages */}
                <div className="min-w-0 space-y-2.5 sm:col-span-7">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{h.whatWeAnalyze}</p>

                  {h.previewSteps.map((step) => (
                    <div key={step.label} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card p-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-soft text-emerald-strong">
                          <Check size={11} strokeWidth={3} aria-hidden />
                        </span>
                        <span className="truncate text-xs font-medium text-ink" title={step.label}>
                          {step.label}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-emerald-strong">{step.value}</span>
                    </div>
                  ))}

                  <div className="flex items-center justify-between gap-2 rounded-xl border border-line-strong bg-emerald-soft/60 p-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy text-[10px] font-bold text-white">4</span>
                      <span className="truncate text-xs font-semibold text-ink">{h.finalStep}</span>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-emerald-strong">{h.finalValue}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-line pt-3">
                <span className="text-[11px] text-muted">
                  {h.avgTime} <strong className="text-ink">{h.avgTimeValue}</strong>
                </span>
                <Link href="/onboarding" className="shrink-0 text-xs font-semibold text-emerald-strong transition-colors hover:text-ink">
                  {h.tryOwn}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dark benefits band */}
      <div className="relative border-t border-white/10 bg-navy text-white">
        <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-3 text-xs font-medium sm:text-[13px] md:grid-cols-3">
            {h.benefits.map((benefit, i) => (
              <div
                key={benefit}
                className={cx("flex items-center justify-center gap-2.5 text-center md:text-left", i === 0 && "md:justify-start", i === h.benefits.length - 1 && "md:justify-end")}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[#9fd1b3]">
                  <Check size={12} strokeWidth={2.5} aria-hidden />
                </span>
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
