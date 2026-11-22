"use client";

import { CheckSquare, FolderCheck, Square, Zap } from "lucide-react";
import { useAssessment } from "./AssessmentProvider";
import { Badge, Card, CardHeader, cx, ProgressBar } from "./ui";
import { tr } from "@/lib/i18n/tr";

interface DocItem {
  /** Same ids as the consultant checklist (lib/consultant.ts) so both share the ticks. */
  id: string;
  label: string;
  where: string;
  /** Real-source evidence that ticks it automatically (null = manual only). */
  auto: string | null;
}

/**
 * "Dosar de credit România": the documents Romanian banks ask for, with a 0-100% progress bar.
 * Items are ticked automatically when a real source already proves them (ANAF bilanț, ANAF active,
 * clean portal.just.ro, uploaded e-Factura); everything else is ticked by hand.
 */
export function DocumentChecklist() {
  const { official, verification, legal, assessment, docs, toggleDoc } = useAssessment();
  const bilant = verification.sources.find((s) => s.sourceId === "anaf_bilant");
  const anaf = verification.sources.find((s) => s.sourceId === "anaf_general");
  const bilantOk = bilant?.availability === "verified" && (official.bilant?.length ?? 0) > 0;
  const activeFiscal = anaf?.availability === "verified" && official.anaf !== null && !official.anaf?.inactiv;
  const portalClean = Boolean(legal && !legal.isFallback && legal.totalDeduction === 0 && !legal.integrityKillSwitch);
  const hasInvoices = assessment.metrics.issuedCount + assessment.metrics.receivedCount > 0;

  const items: DocItem[] = [
    { id: "bilant", label: tr("Bilanț financiar (ultimii 2 ani)"), where: tr("Contabil; recipisa de depunere ANAF"), auto: bilantOk ? tr("ANAF Bilanț verificat ({n} ani publicați)", { n: official.bilant?.length ?? 0 }) : null },
    { id: "balanta", label: tr("Balanță de verificare pe ultima lună închisă"), where: tr("Contabil"), auto: null },
    { id: "atestare", label: tr("Certificat de atestare fiscală ANAF"), where: "SPV ANAF", auto: activeFiscal ? tr("ANAF confirmă: firmă activă fiscal") : null },
    { id: "statut", label: tr("Act constitutiv actualizat & CUI"), where: tr("ONRC / arhiva firmei"), auto: null },
    { id: "litigii", label: tr("Situație litigii / cazier fiscal"), where: "portal.just.ro + SPV ANAF", auto: portalClean ? tr("portal.just.ro curat (0 puncte scăzute)") : null },
    { id: "extrase", label: tr("Extrase bancare / situație e-Factura ultimele 6–12 luni"), where: "Internet banking / SPV e-Factura", auto: hasInvoices ? tr("{n} facturi e-Factura încărcate", { n: assessment.metrics.issuedCount + assessment.metrics.receivedCount }) : null },
  ];
  const done = items.filter((d) => d.auto || docs[d.id]).length;
  const pct = Math.round((done / items.length) * 100);

  return (
    <Card className="mt-5 break-inside-avoid">
      <CardHeader
        icon={<FolderCheck size={18} />}
        title={tr("Checklist „Dosar de Credit România”")}
        subtitle={tr("Actele cerute de băncile din România. Cele dovedite deja de surse reale se bifează automat.")}
        action={<Badge tone={pct === 100 ? "emerald" : pct >= 50 ? "blue" : "amber"}>{tr("{p}% complet", { p: pct })}</Badge>}
      />
      <ProgressBar value={pct} tone={pct === 100 ? "emerald" : pct >= 50 ? "blue" : "amber"} className="mb-4 h-2" />
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((d) => {
          const checked = Boolean(d.auto || docs[d.id]);
          return (
            <li key={d.id}>
              <button
                type="button"
                disabled={Boolean(d.auto)}
                onClick={() => toggleDoc(d.id)}
                className={cx("flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors", checked ? "border-emerald/30 bg-emerald-soft/40" : "border-line hover:bg-canvas", d.auto && "cursor-default")}
              >
                {checked ? <CheckSquare size={17} className="mt-0.5 shrink-0 text-emerald-strong" /> : <Square size={17} className="mt-0.5 shrink-0 text-faint" />}
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{d.label}</span>
                  <span className="block text-[11px] text-muted">{d.where}</span>
                  {d.auto && (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-strong">
                      <Zap size={11} /> {tr("auto-bifat:")} {d.auto}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
