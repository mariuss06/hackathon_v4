import { CalendarClock, ChevronDown, CircleCheck, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import type { CourtCase, LegalCheckResult, SeverityLevel } from "@/types/scoring";
import { MINOR_DEDUCTION_CAP, SEVERITY_DEDUCTION, SEVERITY_LABEL } from "@/lib/scoringEngine";
import { cx, NeuButton } from "@/components/ui/neu";

const SOURCE_BADGE: Record<LegalCheckResult["source"], { label: string; cls: string }> = {
  "portal.just.ro": { label: "LIVE portal.just.ro", cls: "text-positive" },
  simulation: { label: "SIMULARE", cls: "text-amber" },
  fallback: { label: "FALLBACK", cls: "text-scarlet" },
};

const LEVELS: SeverityLevel[] = [0, 1, 2, 3, 4];

const LEVEL_STYLE: Record<SeverityLevel, { text: string; dot: string; ring: string }> = {
  0: { text: "text-positive", dot: "bg-positive", ring: "" },
  1: { text: "text-teal", dot: "bg-teal", ring: "" },
  2: { text: "text-amber", dot: "bg-amber", ring: "ring-1 ring-amber/40" },
  3: { text: "text-scarlet", dot: "bg-scarlet/70", ring: "ring-1 ring-scarlet/40" },
  4: { text: "text-scarlet", dot: "bg-scarlet", ring: "ring-2 ring-scarlet/70" },
};

const LEVEL_EXAMPLES: Record<SeverityLevel, string> = {
  0: "câștigat, achitat, clasat, amendă anulată, creditor / victimă, succesiuni",
  1: "amendă menținută, proces penal încetat, litigiu în curs",
  2: "datorie pierdută în instanță, dispută ANAF, amendă neplătită",
  3: "executare silită, condamnare de drept comun",
  4: "insolvența firmei, evaziune, înșelăciune, fals, mită",
};

function deductionText(level: SeverityLevel) {
  return level === 4 ? "kill-switch" : level === 0 ? "0p" : `-${SEVERITY_DEDUCTION[level]}p`;
}

function FinalityBadge({ c }: { c: CourtCase }) {
  if (c.outcome === "in_curs" || c.isFinal === null) return null;
  return (
    <span
      className={cx(
        "neu-pressed-sm rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        c.isFinal ? "text-ink" : "text-muted",
      )}
    >
      {c.isFinal ? "definitivă" : "nedefinitivă"}
    </span>
  );
}

function CaseCard({ c }: { c: CourtCase }) {
  const st = LEVEL_STYLE[c.severity];
  return (
    <li className={cx("neu-pressed rounded-2xl p-4", st.ring)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold">{c.numar}</p>
          <p className="text-xs text-muted">
            {c.institutie} {c.data && `· înregistrat ${c.data}`} · {c.categorie}
            {c.stadiu && ` · ${c.stadiu}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="neu-raised-sm rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
            {c.matchedBy}
          </span>
          <span
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
              c.severity === 4 ? "bg-scarlet/15" : "neu-pressed-sm",
              st.text,
            )}
          >
            {c.severity === 4 ? <ShieldAlert size={12} /> : <span className={cx("h-2 w-2 rounded-full", st.dot)} />}
            Nivel {c.severity} · {c.severityLabel} · {c.severity === 4 ? "kill-switch" : c.deduction ? `-${c.deduction}p` : "0p"}
          </span>
        </div>
      </div>

      <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-stone">{c.kindLabel}</p>
      <p className="mt-0.5 text-sm">{c.obiect || "—"}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={cx("text-sm font-bold", c.severity === 0 ? "text-positive" : "text-ink")}>{c.outcomeLabel}</span>
        <FinalityBadge c={c} />
        {c.decisionDate && <span className="font-mono text-[11px] text-muted">{c.decisionDate}</span>}
        {c.nextHearing && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
            <CalendarClock size={12} /> termen {c.nextHearing}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        Calitate în dosar: <span className="text-ink/90">{c.partyRoles.join(" / ") || "necunoscută"}</span>
      </p>

      {c.verdictExcerpt && (
        <blockquote className="mt-3 border-l-2 border-stone/40 pl-3 text-xs leading-relaxed text-muted">
          {c.verdictExcerpt}
        </blockquote>
      )}

      <details className="group mt-3" open={c.deduction > 0}>
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold text-stone">
          <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
          De ce nivelul {c.severity} și {c.severity === 4 ? "kill-switch" : c.deduction ? `-${c.deduction} puncte` : "0 puncte"}
        </summary>
        <ol className="mt-2 space-y-1.5 pl-5 text-xs leading-relaxed text-ink/85 [list-style:decimal]">
          {c.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </details>
    </li>
  );
}

function ScoreBreakdown({ legal }: { legal: LegalCheckResult }) {
  const counts = LEVELS.map((l) => legal.cases.filter((c) => c.severity === l).length);
  const penalized = legal.cases.filter((c) => c.severity > 0);
  return (
    <div className="neu-pressed space-y-4 rounded-2xl p-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Clasificare pe niveluri de gravitate</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-5">
          {LEVELS.map((l) => (
            <div key={l} className={cx("neu-raised-sm rounded-xl p-3", counts[l] === 0 && "opacity-55")}>
              <div className="flex items-center justify-between">
                <span className={cx("inline-flex items-center gap-1.5 text-xs font-bold", LEVEL_STYLE[l].text)}>
                  <span className={cx("h-2 w-2 rounded-full", LEVEL_STYLE[l].dot)} />
                  {l} · {SEVERITY_LABEL[l]}
                </span>
                <span className="font-mono text-sm font-bold">{counts[l]}</span>
              </div>
              <p className="mt-1 font-mono text-[10px] text-muted">{deductionText(l)} / dosar</p>
              <p className="mt-1 text-[10px] leading-snug text-muted">{LEVEL_EXAMPLES[l]}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted">De ce scădem și pentru ce</p>
        {penalized.length === 0 ? (
          <p className="mt-2 text-sm text-positive">Niciun dosar nu scade punctaj: scor legal 100/100.</p>
        ) : legal.integrityKillSwitch ? (
          <p className="mt-2 text-sm text-scarlet">
            {legal.criticalCount} dosar(e) de nivel 4 (critic) – scorul legal devine 0, iar scorul final este plafonat.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 font-mono text-xs">
            <li className="flex justify-between gap-3">
              <span className="text-muted">Punctaj de pornire</span>
              <span>100</span>
            </li>
            {penalized.map((c) => (
              <li key={`${c.numar}-${c.institutie}`} className="flex justify-between gap-3">
                <span className="min-w-0 truncate text-ink/85">
                  {c.numar} · {c.kindLabel} · {c.outcomeLabel.split(" – ")[0].replace(/\s*\(.*\)$/, "")}
                </span>
                <span className={LEVEL_STYLE[c.severity].text}>-{c.deduction}</span>
              </li>
            ))}
            {legal.minorCapApplied && (
              <li className="flex justify-between gap-3 text-teal">
                <span>Plafon dosare minore (max. {MINOR_DEDUCTION_CAP}p în total)</span>
                <span>
                  +
                  {legal.cases.filter((c) => c.severity === 1).reduce((s, c) => s + c.deduction, 0) - MINOR_DEDUCTION_CAP}
                </span>
              </li>
            )}
            <li className="flex justify-between gap-3 border-t border-white/10 pt-1 font-bold">
              <span>Scor legal</span>
              <span>{legal.legalScore}/100</span>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

export function LegalCasesList({
  legal,
  loading,
  onRetry,
}: {
  legal: LegalCheckResult | null;
  loading: boolean;
  onRetry: () => void;
}) {
  if (loading || !legal) {
    return (
      <div className="neu-pressed flex items-center gap-3 rounded-2xl p-5 text-sm text-muted">
        <LoaderCircle className="animate-spin text-stone" size={18} />
        Se interoghează portal.just.ro (până la 15 secunde pentru nume comune)…
      </div>
    );
  }

  const badge = SOURCE_BADGE[legal.source];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cx("neu-pressed-sm rounded-full px-3 py-1 font-mono text-[11px] font-bold tracking-wider", badge.cls)}>
            {badge.label}
          </span>
          <span className="text-xs text-muted">
            Nume exact: „{legal.query.companyName}”{legal.query.ceoName && <> + „{legal.query.ceoName}”</>}
          </span>
        </div>
        <NeuButton variant="ghost" className="px-3 py-2 text-xs" onClick={onRetry}>
          <RefreshCw size={14} /> Re-verifică
        </NeuButton>
      </div>

      <p className={cx("text-sm", legal.isFallback ? "text-amber" : "text-muted")}>{legal.message}</p>

      {!legal.isFallback && legal.cases.length > 0 && <ScoreBreakdown legal={legal} />}

      {legal.cases.length === 0 && !legal.isFallback && (
        <div className="neu-pressed flex items-center gap-3 rounded-2xl p-5">
          <CircleCheck className="text-positive" size={22} />
          <div>
            <p className="font-bold">0 dosare pe numele exact</p>
            <p className="text-xs text-muted">Nicio înregistrare pe numele complet al firmei sau al administratorului.</p>
          </div>
        </div>
      )}

      {legal.cases.length > 0 && (
        <ul className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
          {legal.cases.map((c) => (
            <CaseCard key={`${c.numar}-${c.institutie}-${c.matchedBy}`} c={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
