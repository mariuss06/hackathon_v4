"use client";

import Link from "next/link";
import { Check, FlaskConical } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";

type PortfolioCompany = {
  name: string;
  cui: string;
  invoices: number;
  score: number;
  badge: "eligible" | "plan60" | "eligiblePro";
  tone: "emerald" | "amber";
  active?: boolean;
};

/** Illustrative preview (marketing): the Business demo loads real-flow demo companies instead. */
const PORTFOLIO: PortfolioCompany[] = [
  { name: "NORD FRESH DISTRIBUȚIE SRL", cui: "RO40000001", invoices: 169, score: 72.6, badge: "eligible", tone: "emerald", active: true },
  { name: "TRANSILVANIA LOGISTIC HUB SRL", cui: "RO38291044", invoices: 84, score: 64.0, badge: "plan60", tone: "amber" },
  { name: "ATELIER TECH SOLUTIONS SRL", cui: "RO44910233", invoices: 42, score: 81.2, badge: "eligiblePro", tone: "emerald" },
];

export function BusinessSection() {
  const { t, fmt } = useLanguage();
  const { session, signInDemo } = useAuth();
  const b = t.home.business;
  return (
    <section id="business" className="scroll-mt-24 border-y border-line bg-card py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-line bg-canvas p-6 sm:p-10 lg:p-12">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-soft px-3 py-1 text-xs font-semibold text-emerald-strong">
                {b.badge}
              </span>
              <h2 className="text-balance text-2xl font-bold tracking-tight text-ink sm:text-3xl">{b.title}</h2>
              <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">{b.lead}</p>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-soft text-emerald-strong">
                    <Check size={13} strokeWidth={3} aria-hidden />
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-ink">{b.f1Title}</h4>
                    <p className="mt-0.5 text-xs text-muted">{b.f1Text}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-soft text-emerald-strong">
                    <Check size={13} strokeWidth={3} aria-hidden />
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-ink">{b.f2Title}</h4>
                    <p className="mt-0.5 text-xs text-muted">{b.f2Text}</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/pricing/business"
                  className="inline-flex items-center gap-2 rounded-full bg-navy px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-navy-2"
                >
                  <span>{b.ctaBusiness}</span>
                  <span aria-hidden>→</span>
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-full border border-line bg-card px-5 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-canvas"
                >
                  {b.ctaPricing}
                </Link>
                <Link
                  href="/demo?plan=business"
                  onClick={() => {
                    if (!session) signInDemo();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-navy/25 px-5 py-3.5 text-sm font-medium text-navy-3 transition-colors hover:border-navy/50 hover:text-ink"
                >
                  <FlaskConical size={14} aria-hidden /> {b.ctaDemo}
                </Link>
              </div>
            </div>

            {/* Multi-company portfolio preview */}
            <div className="lg:col-span-5">
              <div className="space-y-3 rounded-2xl border border-line bg-card p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 text-xs text-muted">
                  <span className="font-medium text-ink">{b.portfolio}</span>
                  <span className="rounded-md bg-navy-soft/70 px-2 py-0.5 font-medium text-navy-3">{b.connected}</span>
                </div>

                {PORTFOLIO.map((company) => (
                  <div
                    key={company.name}
                    className={
                      company.active
                        ? "flex items-center justify-between gap-3 rounded-xl border-2 border-emerald/60 bg-emerald-soft/30 p-3.5"
                        : "flex items-center justify-between gap-3 rounded-xl border border-line bg-card p-3.5"
                    }
                  >
                    <div className="min-w-0">
                      <div className={company.active ? "truncate text-xs font-bold text-ink" : "truncate text-xs font-semibold text-ink"}>{company.name}</div>
                      <div className="mt-0.5 truncate text-[11px] text-muted">
                        {company.cui} · {company.invoices} {b.invoices}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={company.active ? "text-sm font-bold text-emerald-strong" : "text-sm font-bold text-ink"}>{fmt.number(company.score, 1)} / 100</div>
                      <span className={company.tone === "amber" ? "text-[10px] font-medium text-amber" : "text-[10px] font-semibold text-emerald-strong"}>
                        {b.badges[company.badge]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
