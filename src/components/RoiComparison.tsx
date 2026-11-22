"use client";

import { Card, CardHeader } from "./ui";
import { ROI_COMPARISON } from "@/lib/pricing";
import { tr } from "@/lib/i18n/tr";
import { useLanguage } from "./LanguageProvider";

/** "De ce merită?" — traditional consultancy vs. CrediFit. */
export function RoiComparison() {
  useLanguage(); // hydration-safe language for tr()
  return (
    <Card>
      <CardHeader title={tr("De ce merită? Consultanță clasică vs. CrediFit")} subtitle={tr("Prețuri reale de piață pentru pregătirea unui dosar de credit IMM în România.")} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2.5 pr-4 font-normal" />
              <th className="py-2.5 pr-4 font-normal">{tr("Consultanță financiară tradițională")}</th>
              <th className="py-2.5 font-medium text-emerald-strong">CrediFit</th>
            </tr>
          </thead>
          <tbody>
            {ROI_COMPARISON.map((row) => (
              <tr key={row.label} className="border-b border-line/60 last:border-0">
                <td className="py-3 pr-4 font-medium text-ink">{tr(row.label)}</td>
                <td className="py-3 pr-4 text-muted">{tr(row.traditional)}</td>
                <td className="py-3 text-ink">{tr(row.creditReady)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
