"use client";

import { useState } from "react";
import type { BenchmarkItem, MonthPoint } from "@/types/scoring";
import { monthLabel, num, ron } from "@/lib/util";
import { cx } from "./ui";
import { useHideScores } from "@/lib/useHideScores";
import { tr } from "@/lib/i18n/tr";

/** A formatted number with its decimal part dimmed ("68,3" → 68 + ",3"). */
export function Figure({ value }: { value: string }) {
  const i = value.lastIndexOf(",");
  if (i < 0) return <>{value}</>;
  return (
    <>
      {value.slice(0, i)}
      <span className="opacity-40">{value.slice(i)}</span>
    </>
  );
}

/** Circular score gauge built from two SVG circles. */
export function ScoreRing({
  score,
  size = 168,
  stroke = 14,
  label,
  dark = false,
}: {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
  dark?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, score));
  const color = v >= 75 ? "var(--emerald)" : v >= 55 ? "var(--blue)" : v >= 40 ? "var(--amber)" : "var(--red)";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? "rgba(255,255,255,.12)" : "var(--navy-soft)"} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.7,.2,1), stroke .3s" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className={cx("font-light tracking-tight", dark ? "text-white" : "text-ink")} style={{ fontSize: size * 0.26, lineHeight: 1 }}>
            <Figure value={num(v)} />
          </p>
          <p className={cx("mt-1.5 text-[11px]", dark ? "text-white/60" : "text-faint")}>{label ?? tr("din 100")}</p>
        </div>
      </div>
    </div>
  );
}

/** Monthly revenue bars (uploaded XML part highlighted) + net cash-flow markers. */
export function MonthlyChart({ months }: { months: MonthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...months.map((m) => Math.max(m.revenue, m.purchases)), 1);
  const H = 180;
  const active = hover !== null ? months[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-medium text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-navy-3/30" /> {tr("Vânzări nete (fără TVA)")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald" /> {tr("din XML încărcat")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-faint" /> {tr("Achiziții")}</span>
      </div>
      <div className="relative">
        <div className="flex items-end gap-1.5 sm:gap-2.5" style={{ height: H }} onMouseLeave={() => setHover(null)}>
          {months.map((m, i) => {
            const base = Math.max(0, m.revenue - Math.max(0, m.uploadedRevenue));
            const up = Math.max(0, m.uploadedRevenue);
            const hp = (m.purchases / max) * H;
            return (
              <button
                key={m.month}
                type="button"
                aria-label={`${monthLabel(m.month)}: ${ron(m.revenue)}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                className="group relative flex h-full flex-1 flex-col justify-end"
              >
                <span className="absolute inset-x-0 border-t border-dashed border-faint" style={{ bottom: hp }} />
                {up > 0 && <span className="w-full rounded-t-lg bg-emerald transition-all duration-500" style={{ height: (up / max) * H }} />}
                <span
                  className={cx("w-full transition-all duration-500", up > 0 ? "" : "rounded-t-lg", hover === i ? "bg-navy-3/55" : "bg-navy-3/25")}
                  style={{ height: (base / max) * H }}
                />
              </button>
            );
          })}
        </div>
        {active && (
          <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-xl bg-navy/95 px-3 py-2 text-[11px] text-white shadow-pop backdrop-blur">
            <p className="font-semibold">{monthLabel(active.month)}</p>
            <p>{tr("Vânzări:")} {ron(active.revenue)}</p>
            {active.uploadedRevenue !== 0 && <p className="text-emerald-soft">{tr("din XML:")} {ron(active.uploadedRevenue)}</p>}
            <p>{tr("Achiziții:")} {ron(active.purchases)}</p>
            <p>{tr("Cash-flow net:")} {ron(active.netCashFlow)}</p>
          </div>
        )}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-2.5">
        {months.map((m) => (
          <span key={m.month} className="flex-1 text-center text-[10px] font-medium text-faint">
            {monthLabel(m.month, false)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** "Firma ta vs. sector": structured, readable benchmark comparison table. */
export function BenchmarkTable({ items }: { items: BenchmarkItem[] }) {
  const hideScores = useHideScores();

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[660px] text-left text-xs">
        <thead>
          <tr className="border-b border-line text-faint">
            <th className="pb-3 pr-4 font-semibold">{tr("Indicator")}</th>
            <th className="pb-3 pr-4 font-semibold">{tr("Firma ta")}</th>
            <th className="pb-3 pr-4 font-semibold">{tr("Mediana sector")}</th>
            <th className="pb-3 pr-4 font-semibold min-w-[170px]">{tr("Poziție vs. sector")}</th>
            <th className="pb-3 text-right font-semibold">{tr("Evaluare")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((item) => {
            const fmt = (v: number) => `${num(v)}${item.unit === "zile" ? ` ${tr("z")}` : item.unit}`;

            const minVal = Math.min(item.company, item.median);
            const maxVal = Math.max(item.company, item.median);
            const lo = Math.max(0, minVal * 0.85);
            const hi = maxVal * 1.15 || 1;
            const span = hi - lo || 1;
            const pos = (v: number) => Math.max(5, Math.min(95, ((v - lo) / span) * 100));
            const medPos = pos(item.median);
            const compPos = pos(item.company);

            const isBetter = item.verdict === "mai bun";
            const isLevel = item.verdict === "la nivel";
            const isWorse = item.verdict === "mai slab";

            const badgeCls = isBetter
              ? "bg-emerald-soft text-emerald-strong"
              : isLevel
              ? "bg-blue-soft text-blue"
              : "bg-amber-soft text-amber";

            const dotCls = isBetter ? "bg-emerald-strong" : isLevel ? "bg-blue" : "bg-amber";
            const markerBg = isWorse ? "bg-amber" : isBetter ? "bg-emerald" : "bg-blue";

            return (
              <tr key={item.id} className="transition-colors hover:bg-canvas/50">
                <td className="py-3.5 pr-4 align-middle">
                  <p className="font-semibold text-ink">{tr(item.label)}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {item.higherIsBetter ? tr("mai mare = mai bine") : tr("mai mic = mai bine")}
                  </p>
                </td>
                <td className="py-3.5 pr-4 align-middle whitespace-nowrap">
                  <span className="text-sm font-semibold text-ink">{fmt(item.company)}</span>
                </td>
                <td className="py-3.5 pr-4 align-middle whitespace-nowrap">
                  <span className="text-sm font-medium text-ink">{fmt(item.median)}</span>
                </td>
                <td className="py-3.5 pr-4 align-middle">
                  <div className="relative h-6 w-40 sm:w-48 flex items-center">
                    <div className="absolute inset-x-0 h-1 rounded-full bg-line-strong/60" />
                    <div
                      className="absolute h-4 w-1 -translate-x-1/2 rounded-full bg-navy-3 shadow-2xs"
                      style={{ left: `${medPos}%` }}
                      title={`${tr("Mediana pieței")}: ${fmt(item.median)}`}
                    />
                    <div
                      className={cx(
                        "absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white shadow-sm transition-[left] duration-300",
                        markerBg,
                      )}
                      style={{ left: `${compPos}%` }}
                      title={`${tr("Firma ta")}: ${fmt(item.company)}`}
                    />
                  </div>
                </td>
                <td className="py-3.5 text-right align-middle whitespace-nowrap">
                  <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", badgeCls)}>
                    <span className={cx("h-1.5 w-1.5 rounded-full", dotCls)} />
                    {tr(item.verdict)}
                    {!hideScores && <span className="font-normal opacity-85">· {num(item.score)} p</span>}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs text-muted">
        <div className="flex flex-wrap items-center gap-5">
          <span className="flex items-center gap-1.5 text-[11px]">
            <span className="h-3 w-1 rounded-full bg-navy-3 inline-block" />
            <span>{tr("Linia = Mediana pieței")}</span>
          </span>
          <span className="flex items-center gap-1.5 text-[11px]">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald border border-white shadow-2xs inline-block" />
            <span>{tr("Punctul = Firma ta")}</span>
          </span>
        </div>
        <span className="text-[11px] text-faint">{tr("Valori de referință orientative")}</span>
      </div>
    </div>
  );
}

/** Legacy single-row wrapper retained for compatibility. */
export function BenchmarkRow({ item }: { item: BenchmarkItem }) {
  return <BenchmarkTable items={[item]} />;
}
