"use client";

import { useState } from "react";
import { Check, ChevronDown, Minus } from "lucide-react";
import { Card, CardHeader, cx } from "./ui";
import { FEATURE_MATRIX, PRICING_FAQ, type MatrixCell } from "@/lib/pricing";
import { tr } from "@/lib/i18n/tr";
import { useLanguage } from "./LanguageProvider";

/**
 * Comparison table for the SELF-SERVICE plans only (Starter / Pro / Business).
 * Enterprise/white-label is deliberately not part of this pricing page, so the 4th column is hidden
 * and rows that only made sense for Enterprise (API, pre-qualified leads) are dropped.
 */
const COLUMNS = ["Starter", "Pro", "Business"] as const;
const GROUPS = FEATURE_MATRIX.map((group) => ({
  ...group,
  rows: group.rows
    .map((row) => ({ ...row, cells: row.cells.slice(0, COLUMNS.length) as MatrixCell[] }))
    .filter((row) => row.cells.some((cell) => cell === true || typeof cell === "string")),
})).filter((group) => group.rows.length > 0);

function Cell({ value }: { value: MatrixCell }) {
  if (value === true) return <Check size={16} strokeWidth={2.5} className="mx-auto text-emerald" aria-label={tr("inclus")} />;
  if (value === false) return <Minus size={16} className="mx-auto text-faint" aria-label={tr("neinclus")} />;
  return <span className="text-xs text-ink">{tr(value)}</span>;
}

export function FeatureMatrix() {
  useLanguage(); // hydration-safe language for tr()
  return (
    <Card>
      <CardHeader title={tr("Comparație detaliată a planurilor")} subtitle={tr("Ce primești în fiecare plan, cu limitele exacte.")} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="py-2.5 pr-4 text-left font-normal">{tr("Funcționalitate")}</th>
              {COLUMNS.map((c) => (
                <th key={c} className={cx("w-[16%] py-2.5 text-center font-medium", c === "Pro" ? "text-emerald-strong" : "text-ink")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          {GROUPS.map((group) => (
            <tbody key={group.category}>
              <tr>
                <td colSpan={COLUMNS.length + 1} className="pb-2 pt-5 text-xs font-medium text-faint">
                  {tr(group.category)}
                </td>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.label} className="border-b border-line/60">
                  <td className="py-2.5 pr-4 text-ink">{tr(row.label)}</td>
                  {row.cells.map((cell, i) => (
                    <td key={COLUMNS[i]} className={cx("py-2.5 text-center", i === 1 && "bg-emerald-soft/40")}>
                      <Cell value={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </Card>
  );
}

export function PricingFaq() {
  useLanguage(); // hydration-safe language for tr()
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Card>
      <CardHeader title="F.A.Q." />
      <div className="divide-y divide-line">
        {PRICING_FAQ.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium text-ink"
              >
                {tr(item.q)}
                <ChevronDown size={16} className={cx("shrink-0 text-faint transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && <p className="animate-rise pb-4 pr-8 text-sm leading-relaxed text-muted">{tr(item.a)}</p>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
