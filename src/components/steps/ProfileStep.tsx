"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Building2, CheckSquare, CircleAlert, CircleCheck, Lightbulb, LoaderCircle, Printer, Save, Scale, ShieldAlert, Square, TrendingDown, UserRound } from "lucide-react";
import type { ActionItem, CourtCase, LegalCheckResult } from "@/types/scoring";
import { caseImpact, CONFIDENCE_LABEL, impactLabel, scoreLegalImpact } from "@/lib/scoringEngine";
import { num, getNumberLocale } from "@/lib/util";
import { useAssessment } from "../AssessmentProvider";
import { ConsultantReport } from "../ConsultantReport";
import { BankRecommendationSection } from "../BankRecommendationSection";
import { useCan, useUnlockLabel } from "../PlanGate";
import { useLanguage } from "../LanguageProvider";
import { PortfolioOverview } from "../PortfolioOverview";
import { isDemoCompanyId } from "@/lib/demo";
import { gateActionPlan } from "@/lib/pricing";
import { apiFetch } from "@/lib/auth/client";
import { HowWeScore } from "../HowWeScore";
import { WhatIfSimulator } from "../WhatIfSimulator";
import { HistoryComparisonPanel } from "../HistoryComparisonPanel";
import { DocumentChecklist } from "../DocumentChecklist";
import { BankReportPrint } from "../BankReportPrint";
import { ScoreRing } from "../charts";
import { PageHeader, StepFooter } from "../Shell";
import { AnalysisBody } from "./AnalysisStep";
import { OfficialSourcesCard } from "../OfficialData";
import { Badge, Button, Card, CardHeader, cx, ProgressBar, scoreTone, TONE_TEXT } from "../ui";
import { tr } from "@/lib/i18n/tr";

const PRIORITY_TONE = { critică: "red", ridicată: "amber", medie: "navy" } as const;

function ActionCard({ a, done, onToggle }: { a: ActionItem; done?: boolean; onToggle?: () => void }) {
  const { t } = useLanguage();
  return (
    <li className={cx("rounded-xl border bg-card p-4 transition-colors", done ? "border-emerald/40 bg-emerald-soft/30" : "border-line")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={PRIORITY_TONE[a.priority]}>
          {t.profile.priority} {tr(a.priority)}
        </Badge>
        {a.impactPoints > 0 && (
          <Badge tone="emerald">
            <ArrowRight size={11} /> +{num(a.impactPoints)} pct
          </Badge>
        )}
      </div>
      {onToggle ? (
        <button type="button" onClick={onToggle} className="mt-2 flex w-full items-start gap-2 text-left" aria-pressed={done}>
          {done ? <CheckSquare size={17} className="mt-0.5 shrink-0 text-emerald-strong" /> : <Square size={17} className="mt-0.5 shrink-0 text-faint" />}
          <span className={cx("text-sm font-semibold", done ? "text-muted line-through" : "text-ink")}>{tr(a.title)}</span>
        </button>
      ) : (
        <p className="mt-2 text-sm font-semibold text-ink">{tr(a.title)}</p>
      )}
      <p className="mt-1 text-xs text-muted">{tr(a.why)}</p>
      <ul className="mt-3 space-y-1.5">
        {a.steps.map((s) => (
          <li key={s} className="flex items-start gap-2 text-xs text-ink">
            <span className="mt-1 h-3 w-3 shrink-0 rounded border border-line-strong" />
            {tr(s)}
          </li>
        ))}
      </ul>
    </li>
  );
}

const SOURCE_LABEL: Record<LegalCheckResult["source"], string> = { "portal.just.ro": "Live", fallback: "Indisponibil" };

/** Printable court report for one searched party (always expanded, unlike the step-1 card). */
function LegalPartyReport({ icon, title, name, cases }: { icon: React.ReactNode; title: string; name: string; cases: CourtCase[] }) {
  const { legalScore, totalDeduction, integrityKillSwitch } = scoreLegalImpact(cases);
  return (
    <div className="break-inside-avoid rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy-soft text-navy-3">{icon}</span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-faint">{title}</p>
            <p className="truncate text-sm font-medium text-ink">{name || tr("nespecificat")}</p>
          </div>
        </div>
        {name && (
          <Badge tone={integrityKillSwitch ? "red" : totalDeduction === 0 ? "emerald" : legalScore >= 80 ? "blue" : "amber"}>
            {tr("{n} dosare", { n: cases.length })} · {integrityKillSwitch ? tr("dosar critic") : `-${totalDeduction} p`} · {legalScore}/100
          </Badge>
        )}
      </div>
      {!name ? (
        <p className="mt-3 text-xs text-muted">{tr("Numele nu a fost completat, deci nu a fost căutat.")}</p>
      ) : cases.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-strong">
          <CircleCheck size={16} /> {tr("Fără litigii, insolvențe sau executări silite pe acest nume.")}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {cases.map((c) => (
            <li key={`${c.numar}-${c.institutie}`} className="break-inside-avoid py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-xs font-semibold text-ink">{c.numar}</p>
                <span className={cx("text-xs font-medium", caseImpact(c).severity >= 3 ? "text-red" : caseImpact(c).severity === 2 ? "text-amber" : "text-muted")}>
                  {tr("Nivel {n}", { n: c.severity })} · {tr(c.severityLabel)} · {tr(impactLabel(c))}
                </span>
              </div>
              <p className="text-xs text-ink">
                {tr(c.kindLabel)}: {c.obiect || "—"}
              </p>
              <p className="text-[11px] text-muted">
                {tr(c.outcomeLabel)} · {c.partyRoles.map((r) => tr(r)).join(" / ") || tr("rol necunoscut")} · {tr(c.institutie)}
                {c.confidence &&
                  ` · ${c.userVerdict === "confirmat" ? tr("confirmat de client") : c.userVerdict === "contestat" ? tr("contestat de client (omonim, de verificat după CNP)") : tr(CONFIDENCE_LABEL[c.confidence]).toLowerCase()}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProfileStep() {
  const { assessment, company, quiz, investment, legal, legalLoading, uploads, markVisited, plan: activePlan, showUpgrade, payPerUse, saveSnapshot, doneActions, toggleAction } = useAssessment();
  const { final: f, drivers, plan, quiz: q, business: b } = assessment;
  const canExport = useCan("exportPdf");
  const unlockLabel = useUnlockLabel();
  const { t } = useLanguage();
  const pr = t.profile;
  // Starter: preview of the top 2 actions, the rest blurred.
  const lockedActions = new Set(gateActionPlan(activePlan.planTier, plan, payPerUse).locked.map((a) => a.id));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  useEffect(() => markVisited("profil"), [markVisited]);

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    // Demo companies never reach Supabase: only the browser history keeps the snapshot.
    if (isDemoCompanyId(company.id)) {
      const snap = await saveSnapshot();
      setSaveMsg(`${pr.demoSave} ${snap.message}`);
      setSaving(false);
      return;
    }
    try {
      const r = await apiFetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, quiz, investment, legal, uploads }),
      }).then((x) => x.json());
      const snap = await saveSnapshot();
      setSaveMsg([r.saved ? tr("Evaluare salvată în Supabase (scor recalculat pe server: {s}).", { s: r.finalScore }) : tr(r.error ?? r.message ?? ""), tr(snap.message)].filter(Boolean).join(" "));
    } catch {
      setSaveMsg(pr.apiDown);
    } finally {
      setSaving(false);
    }
  };

  const pillars = [
    {
      name: pr.pillarBusiness,
      weight: "70%",
      score: f.pillars.business.score,
      points: f.pillars.business.points,
      max: 70,
      detail: b.items.map((i) => `${tr(i.label)}: ${num(i.score)}`).join(" · "),
    },
    {
      name: pr.pillarHuman,
      weight: "15%",
      score: f.pillars.human.score,
      points: f.pillars.human.points,
      max: 15,
      detail:
        f.pillars.human.externalScore !== undefined
          ? `Quiz ${q.total}/100 (${tr(q.levelLabel)}) · ${tr("surse oficiale reale")} ${num(f.pillars.human.externalScore)}/100 (portal.just.ro ${assessment.legalScore ?? tr("indisponibil")}${assessment.legalScore !== null ? "/100" : ""})`
          : `Quiz ${q.total}/100 (${tr(q.levelLabel)}) · ${tr("verificări externe")} ${legalLoading ? tr("în curs") : tr("fără răspuns încă (nu intră în scor)")}`,
    },
    {
      name: pr.pillarInvestment,
      weight: "15%",
      score: f.pillars.investment.score,
      points: f.pillars.investment.points,
      max: 15,
      detail: tr("Formular {f}/100 · benchmark sector orientativ {b}/100", { f: f.pillars.investment.formScore, b: num(f.pillars.investment.benchmarkScore) }),
    },
  ];
  const maxLost = Math.max(...drivers.map((d) => d.lostPoints), 1);
  const unlockedPlan = plan.filter((a) => !lockedActions.has(a.id));
  const doneVisible = unlockedPlan.filter((a) => doneActions.includes(a.id));
  const projectedGain = Math.round(doneVisible.reduce((s, a) => s + a.impactPoints, 0) * 10) / 10;
  const projected = Math.min(100, Math.round((f.finalScore + projectedGain) * 10) / 10);
  const maxProjected = Math.min(100, Math.round((f.finalScore + unlockedPlan.reduce((s, a) => s + a.impactPoints, 0)) * 10) / 10);

  return (
    <div className="animate-rise">
      <PageHeader
        title={pr.title}
        subtitle={pr.subtitle}
        action={
          <div className="no-print flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                canExport ? window.print() : showUpgrade(pr.exportUpsell)
              }
            >
              <Printer size={15} /> {pr.print}
            </Button>
            <BankReportPrint
              allowed={canExport}
              onBlocked={() => showUpgrade(pr.pdfUpsell)}
            />
            <Button onClick={save} disabled={saving}>
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} {pr.save}
            </Button>
          </div>
        }
      />
      {saveMsg && <p className="no-print -mt-3 mb-4 text-xs font-medium text-navy-3">{saveMsg}</p>}

      <PortfolioOverview />

      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="grid gap-0 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="flex flex-col items-center justify-center border-b border-line bg-canvas/50 px-6 py-8 xl:border-b-0 xl:border-r">
            {f.complete ? (
              <ScoreRing score={f.finalScore} size={180} stroke={8} />
            ) : (
              <div className="grid h-[180px] w-[180px] place-items-center rounded-full border-8 border-line text-center">
                <div>
                  <p className="text-4xl font-light text-faint">—</p>
                  <p className="text-xs text-faint">{pr.incomplete}</p>
                </div>
              </div>
            )}
            <p className="mt-4 text-center text-lg font-medium">{f.complete ? (t.common.status[f.status] ?? f.status) : pr.missingData}</p>
            {!f.complete && <p className="mt-1 max-w-[240px] text-center text-[11px] text-muted">{pr.missingList((f.missing ?? []).join("; "))}</p>}
            <p className="max-w-full break-words text-center text-xs text-muted">{company.name}</p>
          </div>
          <div className="min-w-0 p-5 sm:p-6">
            <div className="grid gap-3 md:grid-cols-3">
              {pillars.map((p) => (
                <div key={p.name} className="flex h-full min-w-0 flex-col rounded-xl border border-line p-4">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-semibold text-ink">{p.name}</p>
                    <span className="text-[11px] font-semibold text-faint">{p.weight}</span>
                  </div>
                  <p className={cx("mt-1 text-2xl font-medium", f.complete ? TONE_TEXT[scoreTone(p.score)] : "text-faint")}>{f.complete ? num(p.score) : "—"}</p>
                  <ProgressBar value={f.complete ? p.score : 0} className="mt-1.5" />
                  <p className="mt-2 text-xs font-medium text-ink">
                    {f.complete ? num(p.points) : "—"} {pr.pointsOf(p.max)}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{p.detail}</p>
                </div>
              ))}
            </div>
            {f.warnings.length > 0 && (
              <div className="mt-4 space-y-2">
                {f.warnings.map((w) => (
                  <p key={w} className="flex items-start gap-2 rounded-xl border border-red/30 bg-red-soft px-4 py-3 text-sm font-medium text-red">
                    <ShieldAlert size={17} className="mt-0.5 shrink-0" /> {tr(w)}
                  </p>
                ))}
              </div>
            )}
            {q.answered < 5 && (
              <p className="mt-3 flex items-center gap-2 text-xs font-medium text-amber">
                <CircleAlert size={14} /> {pr.quizIncomplete(q.answered)}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Official public-source verification — moved here from step 1, where it was just a "needs CUI" placeholder.
          In the final report the actual S_VerificăriExterne score is revealed. */}
      <div className="mt-5">
        <OfficialSourcesCard />
      </div>

      {/* The old step-2 analysis is now part of the final report, right under the score. */}
      <AnalysisBody />

      <WhatIfSimulator />

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader icon={<TrendingDown size={18} />} title={pr.dragTitle} subtitle={pr.dragSubtitle} />
          {!f.complete && <p className="text-xs text-muted">{pr.dragPending}</p>}
          <ul className={cx("space-y-3.5", !f.complete && "hidden")}>
            {drivers.slice(0, 6).map((d) => (
              <li key={d.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">
                    {tr(d.label)} <span className="text-[11px] font-medium text-faint">· {tr(d.pillar)}</span>
                  </p>
                  <span className="shrink-0 text-sm font-medium text-red">−{num(d.lostPoints)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-canvas">
                  <div className="h-full rounded-full bg-red/70" style={{ width: `${(d.lostPoints / maxLost) * 100}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-muted">{tr(d.detail)}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader icon={<Lightbulb size={18} />} title={pr.planTitle} subtitle={pr.planSubtitle} />
          {f.complete && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-canvas px-4 py-3">
              <div>
                <p className="text-[11px] text-muted">{pr.currentScore}</p>
                <p className="text-2xl font-light tracking-tight text-ink">{num(f.finalScore)}</p>
              </div>
              <ArrowRight size={16} className="text-faint" />
              <div>
                <p className="text-[11px] text-muted">{pr.projected}</p>
                <p className="text-2xl font-light tracking-tight text-emerald-strong">{num(projected)}</p>
              </div>
              <Badge tone={projectedGain > 0 ? "emerald" : "neutral"} className="ml-auto">
                {projectedGain > 0 ? pr.projectedGain(num(projectedGain), doneVisible.length) : pr.tickActions}
              </Badge>
              <p className="w-full text-[11px] text-faint">{pr.maxProjected(num(maxProjected))}</p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {([30, 60, 90] as const).map((h) => {
              const items = plan.filter((a) => a.horizon === h);
              return (
                <div key={h}>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-navy-3">
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-line-strong text-[10px] text-ink">{h}</span>
                    {pr.horizon[h]}
                  </p>
                  {items.length ? (
                    <ul className="space-y-3">
                      {items.map((a) =>
                        lockedActions.has(a.id) ? (
                          <div key={a.id} aria-hidden className="pointer-events-none select-none blur-[5px] saturate-50">
                            <ActionCard a={a} />
                          </div>
                        ) : (
                          <ActionCard key={a.id} a={a} done={doneActions.includes(a.id)} onToggle={() => toggleAction(a.id)} />
                        ),
                      )}
                    </ul>
                  ) : (
                    <p className="rounded-xl border border-dashed border-line p-4 text-xs text-faint">{pr.noAction}</p>
                  )}
                </div>
              );
            })}
          </div>
          {lockedActions.size > 0 && (
            <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-3">
              <p className="text-xs text-muted">
                {pr.previewLocked(lockedActions.size)}
              </p>
              <Link href="/pricing" className="rounded-full bg-navy px-4 py-2 text-xs font-medium text-white hover:bg-navy-2">
                {unlockLabel}
              </Link>
            </div>
          )}
        </Card>
      </div>

      <BankRecommendationSection />

      <HistoryComparisonPanel />

      <DocumentChecklist />

      <ConsultantReport />

      <Card className="mt-5 break-inside-avoid">
        <CardHeader
          icon={<Scale size={18} />}
          title={pr.legalTitle}
          subtitle={
            legal
              ? tr("Scor legal {s}/100 (intră 50% în Factor uman) · sursă: {src} · {d}", { s: legal.legalScore, src: tr(SOURCE_LABEL[legal.source]), d: new Date(legal.checkedAt).toLocaleString(getNumberLocale()) })
              : pr.legalPending
          }
          action={legal && <Badge tone={legal.source === "portal.just.ro" ? "emerald" : "red"}>{tr(SOURCE_LABEL[legal.source])}</Badge>}
        />
        {legal && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <LegalPartyReport icon={<Building2 size={16} />} title={pr.legalCompany} name={legal.query.companyName} cases={legal.cases.filter((c) => c.matchedBy === "firma")} />
              <LegalPartyReport icon={<UserRound size={16} />} title={pr.legalAdmin} name={legal.query.ceoName} cases={legal.cases.filter((c) => c.matchedBy !== "firma")} />
            </div>
            {legal.integrityKillSwitch && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-red/30 bg-red-soft px-4 py-3 text-sm font-medium text-red">
                <ShieldAlert size={17} className="mt-0.5 shrink-0" /> {tr("Dosar critic (insolvență / infracțiune economică): scorul legal devine 0.")}
              </p>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-faint">
              {tr(legal.message)} {tr("Scorul legal combină firma și administratorul; un dosar găsit pe ambele nume apare o singură dată, la firmă.")}
            </p>
          </>
        )}
      </Card>

      <HowWeScore />

      <StepFooter prev="/investitie" />
    </div>
  );
}
