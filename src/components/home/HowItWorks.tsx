"use client";

import Link from "next/link";
import { ArrowRight, Building2, CircleCheckBig, FileText, TrendingUp } from "lucide-react";
import { cx } from "@/components/ui";
import { useLanguage } from "@/components/LanguageProvider";

/** The sequential flow: company data/e-Factura, knowledge quiz, investment quiz, final analysis. Texts in the dictionary. */
const STEPS = [
  { n: 1, href: "/onboarding", icon: Building2, highlight: false },
  { n: 2, href: "/quiz", icon: FileText, highlight: false },
  { n: 3, href: "/investitie", icon: TrendingUp, highlight: false },
  { n: 4, href: "/profil", icon: CircleCheckBig, highlight: true },
];

export function HowItWorks() {
  const { t } = useLanguage();
  const h = t.home.how;
  return (
    <section id="cum-functioneaza" className="scroll-mt-24 py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-strong">{h.eyebrow}</span>
            <h2 className="mt-2 text-balance text-2xl font-bold tracking-tight text-ink sm:text-3xl">{h.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
              {h.lead}
            </p>
          </div>
          <Link
            href="/onboarding"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-navy px-5 py-3 text-xs font-semibold text-white transition-colors hover:bg-navy-2 sm:text-sm"
          >
            <span>{h.cta}</span>
            <ArrowRight size={15} aria-hidden />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const copy = h.steps[i];
            return (
              <div
                key={step.n}
                className="group flex h-full flex-col justify-between rounded-2xl border border-line bg-card p-6 shadow-card transition-colors hover:border-emerald/60"
              >
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <span
                      className={cx(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        step.highlight ? "bg-emerald-soft text-emerald-strong" : "bg-navy-soft/70 text-ink",
                      )}
                    >
                      {h.stepOf(step.n)}
                    </span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-soft text-emerald-strong transition-colors group-hover:bg-emerald group-hover:text-white">
                      <Icon size={16} aria-hidden />
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-ink transition-colors group-hover:text-emerald-strong">{copy.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted sm:text-sm">{copy.description}</p>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-line/70 pt-3 text-xs font-medium text-emerald-strong">
                  <span>{copy.footer}</span>
                  <span aria-hidden>→</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
