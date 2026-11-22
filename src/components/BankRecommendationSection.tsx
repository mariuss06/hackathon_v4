"use client";

import { ChevronDown, CircleAlert, CircleCheck, Info, Landmark, ShieldAlert, Trophy } from "lucide-react";
import type { BankRecommendation } from "@/lib/bank-matcher";
import { num, ron } from "@/lib/util";
import { useAssessment } from "./AssessmentProvider";
import { LockedGate } from "./PlanGate";
import { BankLogo } from "./BankLogos";
import { Badge, Card, CardHeader, cx, ProgressBar } from "./ui";
import { tr } from "@/lib/i18n/tr";

/** Bank mark in the bank's brand colours (components/BankLogos.tsx). */
function BankMark({ bank, large }: { bank: string; large?: boolean }) {
  return <BankLogo bank={bank} size={large ? 48 : 36} />;
}

const matchTone = (pct: number) => (pct >= 80 ? "emerald" : pct >= 60 ? "blue" : pct >= 45 ? "amber" : "red");

function Facts({ r }: { r: BankRecommendation }) {
  const facts = [
    { label: tr("Dobândă orientativă"), value: `${num(r.rateRangePct[0])}–${num(r.rateRangePct[1])}% ${tr("/ an")}`, hint: tr(r.rateLabel) },
    { label: tr("Maturitate"), value: tr(r.maturityLabel) },
    { label: tr("Aport minim"), value: tr(r.minOwnLabel), hint: r.minDscr > 0 ? tr("DSCR minim {d}×", { d: num(r.minDscr) }) : undefined },
    r.dscrAtProduct !== null
      ? {
          label: r.kind === "capital_lucru" && r.maturityLabel.includes("revolving") ? tr("Cost lunar estimat (dobândă)") : tr("Rată lunară estimată"),
          value: r.monthlyCost > 0 ? `${ron(r.monthlyCost)} ${tr("/ lună")}` : "—",
          hint: r.dscrAtProduct >= 99 ? tr("fără datorii") : tr("DSCR la acest produs {d}×", { d: num(r.dscrAtProduct) }),
        }
      : { label: tr("Rambursare"), value: tr("din încasarea facturilor"), hint: tr("fără rată lunară fixă") },
    { label: tr("Sumă maximă estimată"), value: r.maxAmount > 0 ? ron(r.maxAmount) : "—", hint: tr(r.maxAmountBasis) },
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {facts.map((f) => (
        <div key={f.label} className="rounded-xl border border-line/80 bg-white/60 p-3">
          <dt className="text-[11px] text-muted">{f.label}</dt>
          <dd className="mt-1 text-sm font-medium text-ink">{f.value}</dd>
          {f.hint && <dd className="mt-0.5 text-[11px] leading-snug text-faint">{f.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

function ReasonLists({ r, compact }: { r: BankRecommendation; compact?: boolean }) {
  const conditions = compact ? r.conditions.slice(0, 2) : r.conditions;
  return (
    <div className={cx("grid gap-4", !compact && "md:grid-cols-2")}>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink">{tr("De ce se potrivește")}</p>
        <ul className="space-y-1.5">
          {r.reasons.map((x) => (
            <li key={x} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
              <CircleCheck size={14} className="mt-0.5 shrink-0 text-emerald-strong" /> {tr(x)}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink">{tr("Ce trebuie rezolvat înainte de aplicare")}</p>
        {conditions.length ? (
          <ul className="space-y-1.5">
            {conditions.map((x) => (
              <li key={x} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
                <CircleAlert size={14} className="mt-0.5 shrink-0 text-amber" /> {tr(x)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">{tr("Niciun blocaj identificat pe datele analizate.")}</p>
        )}
      </div>
    </div>
  );
}

function TopPick({ r }: { r: BankRecommendation }) {
  return (
    <article className="rounded-2xl border-2 border-emerald/40 bg-emerald-soft/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <BankMark bank={r.bank} large />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="emerald">
                <Trophy size={12} /> {tr("Cea mai bună potrivire")}
              </Badge>
              <Badge tone="neutral">{tr(r.kindLabel)}</Badge>
              <Badge tone={r.eligible ? "emerald" : "amber"}>{r.eligible ? tr("Criterii minime îndeplinite") : tr("Eligibilitate condiționată")}</Badge>
            </div>
            <h3 className="mt-2 text-lg font-medium leading-tight text-ink">{r.bank}</h3>
            <p className="text-sm text-muted">{tr(r.product)}</p>
            <p className="mt-1 text-[11px] text-faint">{tr("Ideal pentru:")} {tr(r.idealFor)}</p>
          </div>
        </div>
        <div className="w-40 text-right">
          <p className="text-[11px] text-muted">{tr("Potrivire")}</p>
          <p className="text-4xl font-light tracking-tight text-ink">
            {r.matchPct}
            <span className="text-lg text-faint">%</span>
          </p>
          <ProgressBar value={r.matchPct} tone={matchTone(r.matchPct)} className="mt-1" />
        </div>
      </div>
      <div className="mt-4">
        <Facts r={r} />
      </div>
      <div className="mt-4">
        <ReasonLists r={r} />
      </div>
    </article>
  );
}

function Alternative({ r, rank }: { r: BankRecommendation; rank: number }) {
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-white/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <BankMark bank={r.bank} />
          <div className="min-w-0">
            <p className="text-[11px] text-faint">{tr("Alternativa {n}", { n: rank })}</p>
            <p className="text-sm font-medium leading-tight text-ink">{r.bank}</p>
            <p className="text-xs leading-snug text-muted">{tr(r.product)}</p>
          </div>
        </div>
        <span className={cx("shrink-0 text-xl font-light", r.matchPct >= 80 ? "text-emerald-strong" : r.matchPct >= 60 ? "text-ink" : "text-amber")}>{r.matchPct}%</span>
      </div>
      <ProgressBar value={r.matchPct} tone={matchTone(r.matchPct)} className="mt-3" />
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone="neutral">{tr(r.kindLabel)}</Badge>
        <Badge tone={r.eligible ? "emerald" : "amber"}>{r.eligible ? tr("Criterii minime OK") : tr("Condiționat")}</Badge>
      </div>
      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{tr("Sumă max. estimată")}</dt>
          <dd className="text-right font-medium text-ink">{r.maxAmount > 0 ? ron(r.maxAmount) : "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{tr("Maturitate")}</dt>
          <dd className="text-right font-medium text-ink">{tr(r.maturityLabel)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{tr("Dobândă orientativă")}</dt>
          <dd className="text-right font-medium text-ink">
            {num(r.rateRangePct[0])}–{num(r.rateRangePct[1])}% {tr("/ an")}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{tr("Aport minim")}</dt>
          <dd className="text-right font-medium text-ink">{tr(r.minOwnLabel)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{tr("Rată lunară estimată")}</dt>
          <dd className="text-right font-medium text-ink">{r.monthlyCost > 0 ? `${ron(r.monthlyCost)}` : r.dscrAtProduct === null ? tr("din facturi") : "—"}</dd>
        </div>
      </dl>
      <div className="mt-3 border-t border-line pt-3">
        <ReasonLists r={r} compact />
      </div>
    </article>
  );
}

/**
 * "Recomandare bancă & pachet de finanțare": best match + 2-3 Romanian alternatives,
 * computed by lib/bank-matcher.ts from the active company's real numbers.
 */
export function BankRecommendationSection() {
  // Starter: only the top pick; alternatives + the full product table are locked (lib/pricing.ts).
  const { assessment, company } = useAssessment();
  const b = assessment.banks;

  // No bank match on missing real data: the matcher would compare products with an estimated profile.
  if (!assessment.final.complete) {
    return (
      <Card className="mt-5 break-inside-avoid" id="recomandare-banca">
        <CardHeader icon={<Landmark size={18} />} title={tr("Recomandare bancă & pachet de finanțare (România)")} subtitle={tr("Pentru {name}", { name: company.name || tr("firma activă") })} />
        <p className="rounded-xl bg-amber-soft px-4 py-3 text-xs font-medium text-amber">
          {tr("Recomandările apar după ce scorul e complet. Lipsesc: {m}.", { m: (assessment.final.missing ?? []).map((x) => tr(x)).join("; ") })}
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-5 break-inside-avoid" id="recomandare-banca">
      <CardHeader
        icon={<Landmark size={18} />}
        title={tr("Recomandare bancă & pachet de finanțare (România)")}
        subtitle={tr("Produse IMM de la BCR, Banca Transilvania, ING, Raiffeisen, CEC și UniCredit, comparate cu profilul {name}: ScorFinal, DSCR, destinație, aport, sumă / CA, DSO, concentrare, sezonalitate și portal.just.ro.", { name: company.name })}
      />

      <p
        className={cx(
          "mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
          b.creditReady ? "border-emerald/30 bg-emerald-soft text-emerald-strong" : "border-red/30 bg-red-soft font-medium text-red",
        )}
      >
        {b.creditReady ? <CircleCheck size={17} className="mt-0.5 shrink-0" /> : <ShieldAlert size={17} className="mt-0.5 shrink-0" />}
        {tr(b.readinessNote)}
      </p>

      <TopPick r={b.top} />

      <LockedGate feature="allBankRecommendations" title={tr("Încă {a} alternative și toate cele {n} produse analizate", { a: b.alternatives.length, n: b.all.length })} className="mt-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {b.alternatives.map((r, i) => (
          <Alternative key={r.id} r={r} rank={i + 1} />
        ))}
      </div>

      <details className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-navy-3">
          <ChevronDown size={15} className="transition-transform group-open:rotate-180" /> {tr("Toate produsele analizate ({n})", { n: b.all.length })}
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="text-faint">
              <tr>
                <th className="py-2 pr-3 font-semibold">{tr("Bancă / pachet")}</th>
                <th className="py-2 pr-3 font-semibold">{tr("Tip")}</th>
                <th className="py-2 pr-3 text-right font-semibold">{tr("Sumă max.")}</th>
                <th className="py-2 pr-3 font-semibold">{tr("Maturitate")}</th>
                <th className="py-2 pr-3 font-semibold">{tr("Dobândă / an")}</th>
                <th className="py-2 pr-3 text-right font-semibold">{tr("Rată / lună")}</th>
                <th className="py-2 pr-3 font-semibold">{tr("Criterii minime")}</th>
                <th className="py-2 text-right font-semibold">{tr("Potrivire")}</th>
              </tr>
            </thead>
            <tbody>
              {b.all.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3">
                    <div className="flex items-start gap-2">
                      <BankLogo bank={r.bank} size={24} />
                      <div>
                        <p className="font-medium text-ink">{r.bank}</p>
                        <p className="text-muted">{tr(r.product)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-3">{tr(r.kindLabel)}</td>
                  <td className="py-2 pr-3 text-right">{r.maxAmount > 0 ? ron(r.maxAmount) : "—"}</td>
                  <td className="py-2 pr-3">{tr(r.maturityLabel)}</td>
                  <td className="py-2 pr-3">
                    {num(r.rateRangePct[0])}–{num(r.rateRangePct[1])}%
                  </td>
                  <td className="py-2 pr-3 text-right">{r.monthlyCost > 0 ? ron(r.monthlyCost) : "—"}</td>
                  <td className={cx("py-2 pr-3", r.eligible ? "text-emerald-strong" : "text-amber")}>{r.eligible ? tr("îndeplinite") : tr("parțial")}</td>
                  <td className="py-2 text-right font-semibold text-ink">{r.matchPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      </LockedGate>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-line/80 bg-canvas px-4 py-3 text-[11px] leading-relaxed text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          <strong className="font-medium text-ink">{tr("Disclaimer:")}</strong> {tr(b.disclaimer)}
        </span>
      </p>
    </Card>
  );
}
