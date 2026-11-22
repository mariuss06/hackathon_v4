"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, BellRing, Building, Lock, Sparkles } from "lucide-react";
import { isDemoCompanyId } from "@/lib/demo";
import { canPerformAction, PLANS, riskAlerts } from "@/lib/pricing";
import { useAssessment } from "./AssessmentProvider";
import { useLanguage } from "./LanguageProvider";
import { Badge, Card, CardHeader, cx, scoreTone, TONE_TEXT } from "./ui";
import { tr } from "@/lib/i18n/tr";

/**
 * Business plan: consolidated multi-company overview. Every row is computed with the same
 * computeAssessment() the single-company report uses, on that company's own workspace only.
 * Pro (several companies) sees it blurred with a Business upsell; one company shows nothing.
 */
export function PortfolioOverview() {
  const { companies, company, assessCompany, switchCompany, plan, isDemo } = useAssessment();
  const { t, fmt, lang } = useLanguage();
  const p = t.portfolio;
  const list = useMemo(() => companies.filter((c) => isDemoCompanyId(c.id) === isDemo), [companies, isDemo]);
  const rows = useMemo(
    () =>
      list
        .map((c) => ({ c, a: assessCompany(c.id) }))
        .filter((r): r is { c: typeof r.c; a: NonNullable<typeof r.a> } => r.a !== null)
        .map(({ c, a }) => ({
          c,
          a,
          alerts: riskAlerts("business", { dscr: a.business.dscr, topClientSharePct: a.metrics.topClientSharePct, creditNotesSharePct: a.metrics.creditNotesSharePct3m }),
        }))
        .sort((x, y) => (y.a.final.complete ? y.a.final.finalScore : -1) - (x.a.final.complete ? x.a.final.finalScore : -1)),
    [list, assessCompany],
  );

  if (rows.length < 2) return null;
  const allowed = canPerformAction(plan.planTier, "portfolioDashboard");
  const complete = rows.filter((r) => r.a.final.complete);
  const avg = complete.length ? complete.reduce((s, r) => s + r.a.final.finalScore, 0) / complete.length : null;
  const bankReady = complete.filter((r) => r.a.final.finalScore >= 70).length;
  const totalRevenue = rows.reduce((s, r) => s + r.a.metrics.revenue12m, 0);
  const totalAlerts = rows.reduce((s, r) => s + r.alerts.length, 0);
  const money = (n: number) => (lang === "en" ? `${fmt.money(n)} (${fmt.money(n, "EUR")})` : fmt.money(n));

  const body = (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: p.average, value: avg === null ? "—" : fmt.number(avg, 1), tone: avg === null ? "text-faint" : TONE_TEXT[scoreTone(avg)] },
          { label: p.bankReady, value: `${bankReady} / ${rows.length}`, tone: "text-ink" },
          { label: p.totalRevenue, value: fmt.money(totalRevenue), tone: "text-ink" },
          { label: p.alerts, value: String(totalAlerts), tone: totalAlerts ? "text-amber" : "text-emerald-strong" },
        ].map((k) => (
          <div key={k.label} className="flex min-w-0 flex-col justify-between rounded-2xl border border-line bg-canvas/60 p-3.5">
            <p className="text-[11px] leading-snug text-muted">{k.label}</p>
            <p className={cx("mt-1 truncate text-xl font-medium tracking-tight", k.tone)} title={k.value}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Wide table: scrolls horizontally inside the card on small screens, never the page. */}
      <div className="-mx-5 overflow-x-auto px-5 sm:-mx-7 sm:px-7">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-faint">
              <th className="border-b border-line py-2 pr-3 font-semibold">{p.company}</th>
              <th className="border-b border-line px-3 py-2 text-right font-semibold">{p.score}</th>
              <th className="border-b border-line px-3 py-2 text-right font-semibold">{p.revenue}</th>
              <th className="border-b border-line px-3 py-2 text-right font-semibold">{p.dscr}</th>
              <th className="border-b border-line px-3 py-2 text-right font-semibold">{p.topClient}</th>
              <th className="border-b border-line px-3 py-2 text-right font-semibold">{p.legal}</th>
              <th className="min-w-[230px] border-b border-line px-3 py-2 font-semibold">{p.alerts}</th>
              <th className="border-b border-line py-2 pl-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, a, alerts }) => {
              const active = c.id === company.id;
              return (
                <tr key={c.id} className={cx(active && "bg-emerald-soft/30")}>
                  <td className="max-w-[240px] border-b border-line py-3 pr-3">
                    <p className="truncate font-medium text-ink" title={c.name}>
                      {c.name}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {c.cui || t.common.noCui} · {tr(a.benchmark.sector.shortLabel)}
                      {active && <span className="ml-1 font-semibold text-emerald-strong">· {p.active}</span>}
                    </p>
                  </td>
                  <td className="whitespace-nowrap border-b border-line px-3 py-3 text-right">
                    {a.final.complete ? (
                      <>
                        <span className={cx("text-base font-semibold", TONE_TEXT[scoreTone(a.final.finalScore)])}>{fmt.number(a.final.finalScore, 1)}</span>
                        <span className="block text-[11px] text-muted">{t.common.status[a.final.status] ?? a.final.status}</span>
                      </>
                    ) : (
                      <span className="text-xs text-faint">{p.incomplete}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-b border-line px-3 py-3 text-right text-ink">{money(a.metrics.revenue12m)}</td>
                  <td className={cx("whitespace-nowrap border-b border-line px-3 py-3 text-right font-medium", a.business.dscr < 1.25 ? "text-red" : "text-ink")}>
                    {a.business.dscr >= 99 ? "—" : `${fmt.number(a.business.dscr, 2)}×`}
                  </td>
                  <td className={cx("whitespace-nowrap border-b border-line px-3 py-3 text-right", a.metrics.topClientSharePct > 40 ? "text-amber" : "text-ink")}>
                    {fmt.number(a.metrics.topClientSharePct, 1)}%
                  </td>
                  <td className="whitespace-nowrap border-b border-line px-3 py-3 text-right text-ink">{a.legalScore === null ? "—" : `${a.legalScore}/100`}</td>
                  <td className="border-b border-line px-3 py-3">
                    {alerts.length === 0 ? (
                      <Badge tone="emerald">{p.noAlerts}</Badge>
                    ) : (
                      <ul className="space-y-1">
                        {alerts.map((al) => (
                          <li key={al} className="flex items-start gap-1.5 text-[11px] leading-snug text-amber">
                            <BellRing size={11} className="mt-0.5 shrink-0" /> <span className="min-w-0">{al}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-b border-line py-3 pl-3 text-right">
                    {!active && (
                      <button
                        type="button"
                        onClick={() => {
                          switchCompany(c.id);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-line-strong"
                      >
                        {p.open} <ArrowRight size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {lang === "en" && <p className="mt-3 text-[11px] text-faint">{p.eurNote}</p>}
    </>
  );

  return (
    <Card className="mb-5">
      <CardHeader icon={<Building size={18} />} title={p.title} subtitle={p.subtitle(rows.length)} action={<Badge tone={allowed ? "emerald" : "navy"}>{PLANS.business.name}</Badge>} />
      {allowed ? (
        body
      ) : (
        <div className="relative">
          <div aria-hidden className="pointer-events-none select-none blur-[5px] saturate-50">
            {body}
          </div>
          <div className="no-print absolute inset-0 grid place-items-center p-4">
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-white/95 px-5 py-4 text-center shadow-card">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-soft text-navy-3">
                <Lock size={15} />
              </span>
              <p className="text-sm font-medium text-ink">{p.lockedTitle}</p>
              <Link href="/pricing/business" className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-2">
                <Sparkles size={14} /> {PLANS.business.name}
              </Link>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
