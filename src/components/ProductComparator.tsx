"use client";

import { Scale } from "lucide-react";
import type { InvestmentPurpose } from "@/types/scoring";
import { annuityInstallment } from "@/lib/bcr-formulas";
import { num, ron } from "@/lib/util";
import { useAssessment } from "./AssessmentProvider";
import { Badge, Card, CardHeader, cx } from "./ui";
import { tr } from "@/lib/i18n/tr";

type ProductId = "investitii" | "linie" | "factoring" | "leasing";

interface Row {
  id: ProductId;
  name: string;
  term: string;
  destination: string;
  cost: string;
  monthly: string;
  monthlyHint: string;
  guarantees: string;
}

/** Which instrument fits the firm's main problem: long collections → factoring, equipment → investment / leasing... */
function recommend(purpose: InvestmentPurpose | null, dso: number): { primary: ProductId; alternative: ProductId | null; why: string } {
  if (dso > 45) return { primary: "factoring", alternative: purpose === "growth" ? "investitii" : "linie", why: tr("Clienții plătesc în {d} de zile (peste 45): factoringul transformă facturile în bani imediat, fără o rată fixă în plus.", { d: Math.round(dso) }) };
  switch (purpose) {
    case "growth":
      return { primary: "investitii", alternative: "leasing", why: tr("Destinația este creșterea / utilajele: creditul de investiții pe 36–60 de luni; pentru echipamente, leasingul folosește chiar bunul ca garanție.") };
    case "working_capital":
      return { primary: "linie", alternative: dso > 30 ? "factoring" : null, why: tr("Pentru stocuri și decalaje de plată, linia de credit costă doar pe suma folosită efectiv.") };
    case "marketing":
      return { primary: "investitii", alternative: "linie", why: tr("Marketingul și digitalizarea se finanțează pe termen mediu, cu rată fixă, nu din linia de capital de lucru.") };
    case "refinancing":
      return { primary: "investitii", alternative: "linie", why: tr("Refinanțarea se face pe termen lung, ca rata lunară să scadă.") };
    default:
      return { primary: "investitii", alternative: null, why: tr("Completează destinația finanțării în Pasul 3 pentru o recomandare exactă.") };
  }
}

export function ProductComparator() {
  const { assessment, investment } = useAssessment();
  const m = assessment.metrics;
  const amount = investment.requestedAmount ?? 0;
  const own = (investment.ownContributionPct ?? 0) / 100;
  const financed = Math.max(0, amount * (1 - own));
  const rec = recommend(investment.purpose, m.dsoDays);
  const receivables = (m.annualizedRevenue * m.dsoDays) / 365;
  const show = (v: number) => (amount > 0 ? ron(v) : "—");

  const rows: Row[] = [
    {
      id: "investitii",
      name: tr("Credit de Investiții"),
      term: tr("36–60 luni"),
      destination: tr("Utilaje, extindere, tehnologie, refinanțare"),
      cost: tr("~8,5–10,5%/an"),
      monthly: show(annuityInstallment(financed, 0.095, 60)),
      monthlyHint: tr("anuitate 60 luni la 9,5% pe {v}", { v: show(financed) }),
      guarantees: tr("Ipotecă / gaj pe bunuri, frecvent garanție FNGCIMM"),
    },
    {
      id: "linie",
      name: tr("Linie de Credit"),
      term: tr("12 luni, revolving"),
      destination: tr("Capital de lucru, stocuri, decalaje de încasare"),
      cost: tr("~8,5–10,5%/an doar pe suma folosită"),
      monthly: show((amount * 0.095) / 12),
      monthlyHint: tr("doar dobândă, dacă e folosită integral"),
      guarantees: tr("Cesiune de creanțe, ipotecă mobiliară pe conturi"),
    },
    {
      id: "factoring",
      name: tr("Factoring"),
      term: tr("30–120 zile / factură"),
      destination: tr("Clienți mari cu termene de plată lungi"),
      cost: tr("~8,5–10,5%/an + comision 0,3–1% / factură"),
      monthly: amount > 0 ? `~${ron((Math.min(amount, receivables * 0.8) * 0.095) / 12 + Math.min(amount, receivables * 0.8) * 0.005)}` : "—",
      monthlyHint: tr("fără rată fixă; avans ~80% din creanțe ({v})", { v: ron(receivables) }),
      guarantees: tr("Facturile cedate (riscul trece pe debitor)"),
    },
    {
      id: "leasing",
      name: tr("Leasing Echipamente"),
      term: tr("24–60 luni"),
      destination: tr("Echipamente, utilaje, autovehicule"),
      cost: tr("~8,5–10,2%/an, avans 15–20%"),
      monthly: show(annuityInstallment(amount * 0.85, 0.0935, 60)),
      monthlyHint: tr("60 luni, avans 15% ({v})", { v: show(amount * 0.15) }),
      guarantees: tr("Bunul finanțat (fără ipotecă imobiliară)"),
    },
  ];

  return (
    <Card className="mt-5 break-inside-avoid">
      <CardHeader
        icon={<Scale size={18} />}
        title={tr("Comparator rapid: Investiții vs. Linie de credit vs. Factoring vs. Leasing")}
        subtitle={amount > 0 ? `${tr("Pentru suma de {v}", { v: ron(amount) })}${own > 0 ? ` (${tr("aport {p}%", { p: num(own * 100) })})` : ""}. ${tr("Costuri orientative din piața din România.")}` : tr("Completează suma solicitată în Pasul 3 pentru ratele estimate.")}
      />
      <p className="mb-4 rounded-xl bg-emerald-soft/60 px-4 py-3 text-sm text-ink">{rec.why}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="text-faint">
            <tr>
              <th className="py-2 pr-3 font-semibold">{tr("Produs")}</th>
              <th className="py-2 pr-3 font-semibold">{tr("Destinație ideală")}</th>
              <th className="py-2 pr-3 font-semibold">{tr("Cost orientativ")}</th>
              <th className="py-2 pr-3 text-right font-semibold">{tr("Rată lunară estimată")}</th>
              <th className="py-2 font-semibold">{tr("Garanții necesare")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const primary = r.id === rec.primary;
              return (
                <tr key={r.id} className={cx("border-t border-line align-top", primary && "bg-emerald-soft/40")}>
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-ink">{r.name}</p>
                    <p className="text-muted">{r.term}</p>
                    {primary && <Badge tone="emerald" className="mt-1">{tr("Recomandat pentru profilul tău")}</Badge>}
                    {r.id === rec.alternative && <Badge tone="blue" className="mt-1">{tr("Alternativă bună")}</Badge>}
                  </td>
                  <td className="py-2.5 pr-3 text-ink">{r.destination}</td>
                  <td className="py-2.5 pr-3 text-ink">{r.cost}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <p className="font-medium text-ink">{r.monthly}</p>
                    <p className="text-[10px] text-faint">{r.monthlyHint}</p>
                  </td>
                  <td className="py-2.5 text-ink">{r.guarantees}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
