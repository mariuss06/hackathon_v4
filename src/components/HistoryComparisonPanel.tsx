"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, History, LoaderCircle, Save } from "lucide-react";
import { compareSnapshots, type AssessmentSnapshot } from "@/lib/history";
import { num, getNumberLocale } from "@/lib/util";
import { useAssessment } from "./AssessmentProvider";
import { Badge, Button, Card, CardHeader, cx } from "./ui";
import { tr } from "@/lib/i18n/tr";

const dateLabel = (iso: string) => new Date(iso).toLocaleString(getNumberLocale(), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Score over time: one point per saved evaluation, 60 = the "Credit Ready" line. */
function ScoreTrend({ points }: { points: AssessmentSnapshot[] }) {
  const W = 640;
  const H = 170;
  const pad = { l: 34, r: 14, t: 14, b: 26 };
  const n = points.length;
  const x = (i: number) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v: number) => pad.t + ((100 - v) / 100) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.finalScore).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={tr("Evoluția scorului final în timp")}>
      {[0, 40, 60, 80, 100].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 60 ? "var(--emerald)" : "var(--line)"} strokeDasharray={v === 60 ? "4 4" : undefined} />
          <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--faint)">
            {v}
          </text>
        </g>
      ))}
      <text x={W - pad.r} y={y(60) - 4} textAnchor="end" fontSize="10" fill="var(--emerald-strong)">
        {tr("prag Credit Ready")}
      </text>
      <path d={path} fill="none" stroke="var(--navy)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.id}>
          <circle cx={x(i)} cy={y(p.finalScore)} r="4" fill="var(--card)" stroke="var(--navy)" strokeWidth="2">
            <title>{`${dateLabel(p.createdAt)}: ${num(p.finalScore)}`}</title>
          </circle>
          {(n <= 8 || i === 0 || i === n - 1) && (
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--faint)">
              {new Date(p.createdAt).toLocaleDateString(getNumberLocale(), { day: "2-digit", month: "short" })}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/**
 * "Evaluarea anterioară vs. evaluarea curentă": shown automatically once the company has ≥ 2 saved
 * evaluations (assessment_history in Supabase + this browser). Older evaluations are never overwritten.
 */
export function HistoryComparisonPanel() {
  const { snapshots, saveSnapshot, assessment, company } = useAssessment();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!company.id) return null;
  const prev = snapshots[snapshots.length - 2];
  const curr = snapshots[snapshots.length - 1];
  const deltas = prev && curr ? compareSnapshots(prev, curr) : [];

  const save = async () => {
    setBusy(true);
    const r = await saveSnapshot();
    setMsg(r.message);
    setBusy(false);
  };

  return (
    <Card className="mt-5 break-inside-avoid">
      <CardHeader
        icon={<History size={18} />}
        title={tr("Istoric evaluări & comparație")}
        subtitle={tr(snapshots.length === 1 ? "{n} evaluare salvată pentru {name}. Fiecare salvare păstrează un snapshot nou." : "{n} evaluări salvate pentru {name}. Fiecare salvare păstrează un snapshot nou.", { n: snapshots.length, name: company.officialName || company.name })}
        action={
          <Button variant="secondary" className="no-print px-3.5 py-2 text-xs" onClick={save} disabled={busy || !assessment.final.complete} title={assessment.final.complete ? tr("Salvează snapshot-ul curent") : tr("Doar evaluările complete intră în istoric")}>
            {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />} {tr("Salvează în istoric")}
          </Button>
        }
      />
      {msg && <p className="no-print -mt-2 mb-3 text-xs text-navy-3">{tr(msg)}</p>}
      {snapshots.length < 2 ? (
        <p className="rounded-xl bg-canvas px-4 py-3 text-xs text-muted">
          {snapshots.length === 0
            ? tr("Nicio evaluare salvată încă. Salvează evaluarea acum; după ce încarci facturi noi sau corectezi indicatorii, salvează din nou și comparația apare automat.")
            : tr("Prima evaluare ({d}, scor {s}) este salvată. La următoarea salvare vezi aici evoluția.", { d: dateLabel(snapshots[0].createdAt), s: num(snapshots[0].finalScore) })}
        </p>
      ) : (
        <>
          <div className="grid gap-3 rounded-2xl bg-canvas p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div>
              <p className="text-[11px] text-muted">{tr("Evaluarea anterioară")} · {dateLabel(prev.createdAt)}</p>
              <p className="text-3xl font-light tracking-tight text-ink">{num(prev.finalScore)}</p>
              <p className="text-xs text-muted">{tr(prev.status)}</p>
            </div>
            <ArrowRight size={18} className="hidden text-faint sm:block" />
            <div>
              <p className="text-[11px] text-muted">{tr("Evaluarea curentă")} · {dateLabel(curr.createdAt)}</p>
              <p className="text-3xl font-light tracking-tight text-ink">{num(curr.finalScore)}</p>
              <p className="text-xs text-muted">{tr(curr.status)}</p>
            </div>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {deltas.map((d) => (
              <li key={d.label} className="rounded-xl border border-line p-3">
                <p className="text-[11px] text-muted">{tr(d.label)}</p>
                <p className="mt-0.5 text-sm text-ink">
                  {d.from} <span className="text-faint">→</span> {d.to}
                </p>
                <Badge tone={d.better === null ? "neutral" : d.better ? "emerald" : "red"} className="mt-1">
                  {d.better === null ? null : d.better ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                  {d.better === null ? tr("neschimbat") : tr(d.text)}
                </Badge>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-2xl border border-line p-3">
            <p className="mb-1 px-1 text-xs font-medium text-ink">{tr("Evoluția scorului final")}</p>
            <ScoreTrend points={snapshots.slice(-24)} />
          </div>
          <p className={cx("mt-2 text-[11px] text-faint")}>{tr("Snapshot-urile vin din istoricul firmei (Supabase assessment_history + acest browser) și nu se modifică retroactiv.")}</p>
        </>
      )}
    </Card>
  );
}
