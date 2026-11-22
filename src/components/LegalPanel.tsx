"use client";

import type { ReactNode } from "react";
import { Building2, CalendarClock, ChevronDown, CircleCheck, Fingerprint, LoaderCircle, RefreshCw, Scale, ShieldAlert, UserCheck, UserRound, UserX } from "lucide-react";
import type { CourtCase, SeverityLevel } from "@/types/scoring";
import { caseImpact, caseKey, companyCounty, CONFIDENCE_LABEL, impactLabel, MINOR_DEDUCTION_CAP, scoreLegalImpact } from "@/lib/scoringEngine";
import { useAssessment } from "./AssessmentProvider";
import { useHideScores } from "@/lib/useHideScores";
import { Badge, Button, Card, CardHeader, cx } from "./ui";
import { tr } from "@/lib/i18n/tr";

const LEVEL_TONE: Record<SeverityLevel, "emerald" | "blue" | "amber" | "red"> = { 0: "emerald", 1: "blue", 2: "amber", 3: "red", 4: "red" };

const CONFIDENCE_TONE = { ridicata: "emerald", medie: "amber", scazuta: "neutral" } as const;

/** Identity confidence of a case + the user's confirm / dispute buttons. */
function IdentityRow({ c }: { c: CourtCase }) {
  const { setCaseVerdict } = useAssessment();
  if (!c.confidence) return null;
  const key = caseKey(c);
  const canAnswer = c.matchedBy === "administrator" && c.severity > 0 && c.confidence !== "ridicata";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {c.userVerdict === "confirmat" ? (
        <Badge tone="navy">
          <UserCheck size={12} /> {tr("Confirmat de tine: dosarul tău")}
        </Badge>
      ) : c.userVerdict === "contestat" ? (
        <Badge tone="navy">
          <UserX size={12} /> {tr("Contestat: omonim, banca verifică după CNP")}
        </Badge>
      ) : (
        <Badge tone={CONFIDENCE_TONE[c.confidence]}>
          <Fingerprint size={12} /> {tr(CONFIDENCE_LABEL[c.confidence])}
        </Badge>
      )}
      {canAnswer &&
        (c.userVerdict ? (
          <button type="button" onClick={() => setCaseVerdict(key, null)} className="text-[11px] font-semibold text-navy-3 hover:underline">
            {tr("Anulează răspunsul")}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setCaseVerdict(key, "confirmat")}
              className="rounded-full border border-line-strong bg-white px-2.5 py-0.5 text-[11px] font-semibold text-ink hover:bg-canvas"
            >
              {tr("E dosarul meu")}
            </button>
            <button
              type="button"
              onClick={() => setCaseVerdict(key, "contestat")}
              className="rounded-full border border-line-strong bg-white px-2.5 py-0.5 text-[11px] font-semibold text-ink hover:bg-canvas"
            >
              {tr("Nu sunt eu")}
            </button>
          </>
        ))}
    </div>
  );
}

function CaseItem({ c }: { c: CourtCase }) {
  const counts = caseImpact(c);
  return (
    <li className={cx("rounded-xl border p-4", counts.severity >= 3 ? "border-red/30 bg-red-soft/40" : "border-line bg-canvas/60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-ink">{c.numar}</p>
          <p className="text-[11px] text-muted">
            {tr(c.institutie)} · {tr(c.categorie)} {c.stadiu && `· ${tr(c.stadiu)}`}
          </p>
        </div>
        <Badge tone={LEVEL_TONE[counts.severity]}>
          {counts.severity === 4 && <ShieldAlert size={12} />}
          {tr("Nivel {n}", { n: c.severity })} · {tr(c.severityLabel)} · {tr(impactLabel(c))}
        </Badge>
      </div>
      <IdentityRow c={c} />
      <p className="mt-2 text-[11px] font-semibold text-navy-3">{tr(c.kindLabel)}</p>
      <p className="text-sm text-ink">{c.obiect || "—"}</p>
      <p className="mt-2 text-sm font-medium text-ink">{tr(c.outcomeLabel)}</p>
      <p className="text-[11px] text-muted">
        {tr("Calitate:")} {c.partyRoles.map((r) => tr(r)).join(" / ") || tr("necunoscută")}
        {c.nextHearing && (
          <span className="ml-2 inline-flex items-center gap-1">
            <CalendarClock size={11} /> {tr("termen")} {c.nextHearing}
          </span>
        )}
      </p>
      <details className="group mt-2">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-navy-3">
          <ChevronDown size={13} className="transition-transform group-open:rotate-180" /> {tr("De ce acest nivel")}
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-muted">
          {c.reasons.map((r) => (
            <li key={r}>{tr(r)}</li>
          ))}
          {c.confidenceReasons?.map((r) => (
            <li key={r}>{tr("Identitate:")} {tr(r)}</li>
          ))}
          {c.confidence && c.confidence !== "ridicata" && !c.userVerdict && c.severity > 0 && (
            <li>
              {tr("Până la confirmare:")} {c.confidence === "medie" ? tr("se aplică jumătate din penalizare, iar un dosar critic contează ca grav (fără alertă de integritate)") : tr("nu se aplică nicio penalizare")}.
            </li>
          )}
        </ol>
      </details>
    </li>
  );
}

/** One report per searched party: the company, then the administrator. */
function PartySection({ icon, title, name, cases }: { icon: ReactNode; title: string; name: string; cases: CourtCase[] }) {
  const { legalScore, totalDeduction, integrityKillSwitch } = scoreLegalImpact(cases);
  const hideScores = useHideScores();
  const hasImpact = cases.some((c) => c.deduction > 0 || c.severity === 4);

  return (
    <section className="rounded-xl border border-line p-4">
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
            {tr("{n} dosare", { n: cases.length })}{hideScores ? "" : ` · ${integrityKillSwitch ? tr("dosar critic") : `-${totalDeduction} p`} · ${legalScore}/100`}
          </Badge>
        )}
      </div>

      {!name ? (
        <p className="mt-3 text-xs text-muted">{tr("Completează numele ca să fie căutat în portal.just.ro.")}</p>
      ) : cases.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-strong">
          <CircleCheck size={16} /> {tr("Fără litigii, insolvențe sau executări silite pe acest nume.")}
        </p>
      ) : (
        <details className="group mt-3" open={hasImpact}>
          <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-navy-3">
            <ChevronDown size={15} className="transition-transform group-open:rotate-180" />
            {tr("Vezi dosarele ({n})", { n: cases.length })}
          </summary>
          <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {cases.map((c) => (
              <CaseItem key={`${c.numar}-${c.institutie}-${c.matchedBy}`} c={c} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function LegalPanel() {
  const { legal, legalLoading, runLegalCheck, company } = useAssessment();
  const hideScores = useHideScores();
  const searchedName = (company.officialName || company.name).trim();
  const searchedCeo = company.nameSearchConsent ? company.ceoName.trim() : "";
  const stale =
    legal &&
    (legal.query.companyName !== searchedName ||
      legal.query.ceoName !== searchedCeo ||
      (legal.query.companyCounty !== undefined && legal.query.companyCounty !== companyCounty(company)));

  return (
    <Card>
      <CardHeader
        icon={<Scale size={18} />}
        title={tr("Verificare automată portal.just.ro")}
        subtitle={tr("Interogare SOAP gratuită (portalquery.just.ro) după numele oficial al firmei și, cu acordul lui, al administratorului. Intră în verificările externe (30%).")}
        action={legal && <Badge tone={legal.source === "portal.just.ro" ? "emerald" : "red"}>{legal.source === "portal.just.ro" ? tr("Live") : tr("Indisponibil")}</Badge>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => runLegalCheck()} disabled={legalLoading || !company.id || !company.name}>
          {legalLoading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {legal ? tr("Reverifică") : tr("Verifică acum")}
        </Button>
      </div>

      {!company.id && <p className="mt-3 text-xs text-muted">{tr("Salvează firma în formularul alăturat: verificarea pornește automat.")}</p>}
      {company.id && !company.nameSearchConsent && (
        <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
          {tr("Administratorul nu este căutat: bifează acordul în formularul firmei (GDPR). Se verifică doar firma.")}
        </p>
      )}
      {stale && !legalLoading && <p className="mt-3 rounded-lg bg-amber-soft px-3 py-2 text-xs font-medium text-amber">{tr("Numele s-au schimbat după ultima verificare — apasă „Reverifică”.")}</p>}

      {legalLoading && !legal && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <LoaderCircle size={16} className="animate-spin" /> {tr("Interoghez portal.just.ro…")}
        </p>
      )}

      {legal?.isFallback && (
        <p className="mt-4 rounded-xl bg-amber-soft px-4 py-3 text-xs font-medium text-amber">{tr(legal.message)}</p>
      )}

      {legal && !legal.isFallback && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-canvas p-4">
            {!hideScores && (<div>
              <p className="text-[11px] font-semibold text-faint">{tr("Scor legal")}</p>
              <p className={cx("text-3xl font-medium", legal.legalScore >= 80 ? "text-emerald-strong" : legal.legalScore >= 50 ? "text-amber" : "text-red")}>
                {legal.legalScore}
                <span className="text-base text-faint">/100</span>
              </p>
            </div>)}
            <div className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
              <p>
                <strong className="text-ink">{legal.totalFound}</strong> {tr("dosare pe numele exact")}
                {legal.excludedCount > 0 && <> · {tr("{n} omonime parțiale excluse", { n: legal.excludedCount })}</>}
                {legal.minorCapApplied && <> · {tr("penalizările minore plafonate la {n} p", { n: MINOR_DEDUCTION_CAP })}</>}
                {(legal.uncertainCount ?? 0) > 0 && (
                  <>
                    {" "}
                    · <strong className="text-amber">{tr("{n} cu identitate incertă", { n: legal.uncertainCount ?? 0 })}</strong> {tr("(confirmă sau contestă)")}
                  </>
                )}
              </p>
              <p className="mt-1">{tr(legal.message)}</p>
            </div>
          </div>

          {legal.integrityKillSwitch && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-red/30 bg-red-soft px-4 py-3 text-sm font-medium text-red">
              <ShieldAlert size={18} className="mt-0.5 shrink-0" /> {tr("Dosar critic (insolvență / infracțiune economică): scorul legal devine 0.")}
            </p>
          )}

          <div className="mt-3 space-y-3">
            <PartySection
              icon={<Building2 size={16} />}
              title={tr("Firmă")}
              name={legal.query.companyName}
              cases={legal.cases.filter((c) => c.matchedBy === "firma")}
            />
            <PartySection
              icon={<UserRound size={16} />}
              title={tr("Administrator")}
              name={legal.query.ceoName}
              cases={legal.cases.filter((c) => c.matchedBy !== "firma")}
            />
          </div>
          <p className="mt-3 text-[11px] text-faint">
            {tr("Penalizare: nivel 1 = -3 p (plafon {cap} p) · nivel 2 = -8 p · nivel 3 = -20 p · nivel 4 = scor 0. Dosarele unde partea căutată e creditor/reclamant nu se penalizează. Identitatea administratorului (fără CNP): sigură = penalizare întreagă, probabilă = jumătate, probabil omonim = 0, până confirmi sau contești. Scorul legal de sus combină firma și administratorul; un dosar găsit pe ambele nume apare o singură dată, la firmă.", { cap: MINOR_DEDUCTION_CAP })}
          </p>
        </div>
      )}
    </Card>
  );
}
