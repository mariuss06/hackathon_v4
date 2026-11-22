"use client";

import { useState } from "react";
import { ChartColumn, CircleCheck, FileText, FileWarning, Layers, MessageCircleQuestion, Receipt, RotateCcw, Truck, Users } from "lucide-react";
import type { Invoice, PartyShare } from "@/types/scoring";
import { isStorno } from "@/lib/metrics";
import { LOAN_ANNUAL_RATE, LOAN_MONTHS } from "@/lib/scoringEngine";
import { monthLabel, num, pct, ron } from "@/lib/util";
import { useAssessment } from "../AssessmentProvider";
import { BenchmarkRow, BenchmarkTable, MonthlyChart } from "../charts";
import { SeasonalityHeatmap } from "../SeasonalityHeatmap";
import { LoanSimulator } from "../LoanSimulator";
import { LoanCostBreakdown } from "../LoanCostBreakdown";
import { StressTestPanel } from "../StressTestPanel";
import { ProductComparator } from "../ProductComparator";
import { SpvSyncButton } from "../SpvSyncPanel";
import { explain, type JargonKey } from "@/lib/jargon";
import type { Assessment } from "@/lib/assessment";
import { browserInflateRaw, invoiceXmlFromZip } from "@/lib/efactura/zip";
import { Badge, Button, Card, CardHeader, cx, ProgressBar, Stat } from "../ui";
import { XmlUploadButton } from "../Shell";
import { tr } from "@/lib/i18n/tr";

/**
 * e-Factura intake (step 1): automatic SPV sync or manual XML/ZIP upload. Lives in the data step,
 * not in an analysis page — the analysis itself happens automatically after the quizzes.
 */
export function UploadPanel() {
  const { uploadXml, lastUploadResults, persistMessage, uploads, resetUploads } = useAssessment();
  const [drag, setDrag] = useState(false);

  return (
    <Card className="border-emerald/30">
      <CardHeader
        icon={<Receipt size={18} />}
        title={tr("Facturi e-Factura: preluare automată din SPV sau upload manual")}
        subtitle={tr("Parsăm InvoiceTypeCode (inclusiv 381 storno), IssueDate, DueDate, furnizor, client, TaxExclusiveAmount și PayableAmount. Datele intră automat în analiza finală.")}
        action={
          uploads.length > 0 && (
            <Button variant="ghost" onClick={resetUploads}>
              <RotateCcw size={15} /> {tr("Elimină cele {n} încărcate", { n: uploads.length })}
            </Button>
          )
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-navy/15 bg-navy-soft/50 p-4">
          <p className="text-[11px] font-semibold text-faint">{tr("Opțiunea 1 · automat")}</p>
          <p className="mb-3 mt-0.5 text-xs text-muted">{tr("Certificat digital → SPV ANAF → facturi emise & primite → parsare UBL 2.1.")}</p>
          <SpvSyncButton />
        </div>
        <div className="rounded-2xl border border-line p-4">
          <p className="text-[11px] font-semibold text-faint">{tr("Opțiunea 2 · manual")}</p>
          <p className="mb-3 mt-0.5 text-xs text-muted">{tr("Fișiere .xml UBL 2.1 din programul de facturare sau din SPV.")}</p>
          <XmlUploadButton variant="secondary" label={tr("Încarcă Manual e-Factura")} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDrag(false);
            const all = [...e.dataTransfer.files];
            const files = all.filter((f) => f.name.toLowerCase().endsWith(".xml"));
            // ZIP archives downloaded from SPV are unpacked in the browser (signature files are skipped).
            const zips = all.filter((f) => f.name.toLowerCase().endsWith(".zip"));
            const fromZip = (await Promise.all(zips.map(async (z) => invoiceXmlFromZip(new Uint8Array(await z.arrayBuffer()), browserInflateRaw, z.name).catch(() => [])))).flat();
            const xml = [...(await Promise.all(files.map(async (f) => ({ name: f.name, xml: await f.text() })))), ...fromZip];
            if (xml.length) await uploadXml(xml);
          }}
          className={cx(
            "grid place-items-center rounded-xl border-2 border-dashed p-6 text-center transition-colors",
            drag ? "border-emerald bg-emerald-soft" : "border-line-strong bg-canvas",
          )}
        >
          <div>
            <FileText size={28} className="mx-auto text-navy-3" />
            <p className="mt-2 text-sm font-semibold text-ink">{tr("Trage fișierele XML (sau arhivele ZIP din SPV) aici")}</p>
            <p className="mb-3 text-xs text-muted">{tr("sau")}</p>
            <XmlUploadButton label={tr("Alege fișiere XML")} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-ink">{tr("De unde iei facturile")}</p>
          <ul className="space-y-1.5 text-xs leading-relaxed text-muted">
            <li>{tr("Din SPV (Spațiul Privat Virtual ANAF) → e-Factura → descarcă arhiva fiecărei facturi; în arhivă e fișierul XML.")}</li>
            <li>{tr("Din programul de facturare sau de contabilitate (export XML UBL 2.1 / RO_CIUS).")}</li>
            <li>{tr("Ideal: facturile emise și primite din ultimele 12 luni. Analiza folosește doar facturile încărcate pentru firma activă.")}</li>
          </ul>
          {lastUploadResults.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {lastUploadResults.map((r) => (
                <li key={r.fileName} className={cx("rounded-lg px-3 py-2 text-xs", r.ok ? "bg-emerald-soft text-emerald-strong" : "bg-red-soft text-red")}>
                  <p className="flex items-center gap-1.5 font-semibold">
                    {r.ok ? <CircleCheck size={13} /> : <FileWarning size={13} />}
                    {r.fileName}
                    {r.invoice && ` → ${r.invoice.number} · ${tr("tip")} ${r.invoice.typeCode} · ${r.invoice.direction === "issued" ? tr("emisă") : tr("primită")} · ${ron(r.invoice.taxExclusiveAmount)}`}
                  </p>
                  {r.error && <p>{tr(r.error)}</p>}
                  {r.warnings.map((w) => (
                    <p key={w} className="text-muted">
                      {tr(w)}
                    </p>
                  ))}
                </li>
              ))}
              {persistMessage && <li className="px-1 text-[11px] font-medium text-muted">{tr(persistMessage)}</li>}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function PartyTable({ title, icon, rows, total }: { title: string; icon: React.ReactNode; rows: PartyShare[]; total: string }) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} subtitle={total} />
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.cui || r.name}>
            <div className="mb-1 flex justify-between gap-3 text-sm">
              <span className="truncate font-medium text-ink">
                <span className="mr-2 text-faint">#{i + 1}</span>
                {r.name}
              </span>
              <span className="shrink-0 font-semibold text-ink">{pct(r.sharePct)}</span>
            </div>
            <ProgressBar value={r.sharePct} tone={i === 0 && r.sharePct > 30 ? "amber" : "navy"} />
            <p className="mt-0.5 text-[11px] text-faint">{ron(r.value)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  const rows = [...invoices]
    .sort((a, b) => Number(b.source === "xml-upload") - Number(a.source === "xml-upload") || b.issueDate.localeCompare(a.issueDate))
    .slice(0, 10);
  return (
    <Card>
      <CardHeader icon={<FileText size={18} />} title={tr("Ultimele documente e-Factura")} subtitle={tr("Facturile încărcate din XML apar primele.")} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="text-faint">
            <tr>
              <th className="py-2 pr-3 font-semibold">{tr("Număr")}</th>
              <th className="py-2 pr-3 font-semibold">{tr("Tip")}</th>
              <th className="py-2 pr-3 font-semibold">{tr("Emisă")}</th>
              <th className="py-2 pr-3 font-semibold">{tr("Scadență")}</th>
              <th className="py-2 pr-3 font-semibold">{tr("Partener")}</th>
              <th className="py-2 pr-3 text-right font-semibold">{tr("Fără TVA")}</th>
              <th className="py-2 text-right font-semibold">{tr("Sursă")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className={cx("border-t border-line", i.source === "xml-upload" && "bg-emerald-soft/40")}>
                <td className="py-2 pr-3 font-mono font-medium text-ink">{i.number}</td>
                <td className="py-2 pr-3">
                  <Badge tone={isStorno(i) ? "red" : i.direction === "issued" ? "navy" : "neutral"}>
                    {i.typeCode} {i.direction === "issued" ? tr("emisă") : tr("primită")}
                  </Badge>
                </td>
                <td className="py-2 pr-3">{i.issueDate}</td>
                <td className="py-2 pr-3">{i.dueDate ?? "—"}</td>
                <td className="max-w-[220px] truncate py-2 pr-3">{i.direction === "issued" ? i.customerName : i.supplierName}</td>
                <td className={cx("py-2 pr-3 text-right font-semibold", isStorno(i) ? "text-red" : "text-ink")}>
                  {isStorno(i) ? "-" : ""}
                  {ron(Math.abs(i.taxExclusiveAmount))}
                </td>
                <td className="py-2 text-right">{i.source === "xml-upload" ? <Badge tone="emerald">XML</Badge> : <span className="text-faint">Supabase</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const JARGON: { key: JargonKey; label: string; value: (a: Assessment) => string }[] = [
  { key: "dscr", label: "DSCR", value: (a) => (a.business.dscr >= 99 ? tr("fără datorii") : `${num(a.business.dscr)}×`) },
  { key: "dso", label: "DSO", value: (a) => tr("{n} zile", { n: num(a.metrics.dsoDays) }) },
  { key: "concentration", label: "Concentrare client", value: (a) => pct(a.metrics.topClientSharePct) },
  { key: "storno", label: "Stornări", value: (a) => pct(a.metrics.creditNotesSharePct3m) },
  { key: "volatility", label: "Volatilitate", value: (a) => `CV ${num(a.metrics.revenueCv)}` },
];

/** "Pe înțelesul antreprenorului": each banking indicator in one plain sentence, from the firm's own numbers. */
function PlainLanguageCard({ a }: { a: Assessment }) {
  return (
    <Card className="mt-5">
      <CardHeader icon={<MessageCircleQuestion size={18} />} title={tr("Traducător de jargon bancar — pe înțelesul antreprenorului")} subtitle={tr("Ce înseamnă fiecare indicator pentru firma ta, calculat din cifrele ei reale.")} />
      <ul className="divide-y divide-line">
        {JARGON.map((j) => (
          <li key={j.key} className="grid gap-1 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
            <p className="text-sm font-medium text-ink">
              {tr(j.label)} <span className="font-normal text-muted">· {j.value(a)}</span>
            </p>
            <p className="text-sm leading-relaxed text-ink">{explain(j.key, a)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Sector benchmark: the firm against p25/median/p75 of its CAEN sector. */
function BenchmarkCard() {
  const { company, assessment } = useAssessment();
  const bench = assessment.benchmark;
  return (
    <Card className="mt-5">
      <CardHeader
        icon={<Layers size={18} />}
        title={tr("Firma ta vs. sectorul {s}", { s: tr(bench.sector.shortLabel) })}
        subtitle={`${assessment.sectorSource === "caen" ? tr("mapat din CAEN {c}", { c: company.caenCode }) : assessment.sectorSource === "manual" ? tr("sector ales manual (fără CAEN)") : tr("implicit General IMM (fără CAEN)")} · ${tr(bench.sector.label)} · ${tr("valori de referință orientative (nu statistici oficiale)")}`}
      />
      <BenchmarkTable items={bench.items} />
    </Card>
  );
}

/**
 * The analysis that used to be its own step 2. It is now computed automatically and rendered
 * inside the final report, together with the score — there is no separate analysis panel.
 */
export function AnalysisBody() {
  const { assessment, invoices, investment, company } = useAssessment();
  const m = assessment.metrics;
  const b = assessment.business;

  if (!company.id) {
    return (
      <Card className="mt-5">
        <p className="text-sm text-ink">{tr("Nu ai adăugat încă nicio firmă.")}</p>
        <p className="mt-1 text-xs text-muted">{tr("Completează datele firmei în primul pas (date firmă, e-Factura, ANAF).")}</p>
      </Card>
    );
  }

  if (!assessment.dataStatus.hasInvoices) {
    return (
      <Card className="mt-5">
        <p className="text-sm font-medium text-ink">{tr("Încă nu există facturi e-Factura pentru {name}.", { name: company.name })}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {tr("Stabilitatea încasărilor, DSO, concentrarea clienților, sezonalitatea și DSCR se calculează doar din facturile reale ale firmei. Până le încarci, pilonul Business și scorul final rămân „incomplete” — nu le estimăm din date inventate.")}
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat key={`r12-${m.revenue12m}`} highlight={m.uploadedCount > 0} label={tr("CA 12 luni")} value={ron(m.revenue12m)} hint={tr("{n} facturi emise", { n: m.issuedCount })} />
        <Stat key={`r3-${m.revenueLast3Months}`} highlight={m.uploadedCount > 0} label={tr("CA ultimele 3 luni")} value={ron(m.revenueLast3Months)} hint={tr("fără TVA, net de storno")} />
        <Stat key={`dso-${m.dsoDays}`} label="DSO" value={tr("{n} zile", { n: num(m.dsoDays) })} hint={tr("termen mediu {n} zile", { n: num(m.avgPaymentTermDays) })} tone={m.dsoDays > 45 ? "amber" : undefined} />
        <Stat key={`top-${m.topClientSharePct}`} highlight={m.uploadedCount > 0} label={tr("Client #1")} value={pct(m.topClientSharePct)} hint={m.topClients[0]?.name} tone={m.topClientSharePct > 30 ? "amber" : undefined} />
        <Stat key={`st-${m.creditNotesSharePct3m}`} highlight={m.uploadedCount > 0} label={tr("Stornări 3 luni")} value={pct(m.creditNotesSharePct3m)} hint={tr("prag semnificativ: 5%")} tone={m.creditNotesSharePct3m > 5 ? "red" : undefined} />
        <Stat key={`dscr-${b.dscr}`} label={tr("DSCR estimat")} value={b.dscr >= 99 ? tr("fără datorii") : `${num(b.dscr)}×`} hint={investment.requestedAmount ? tr("cu rata nouă {r}", { r: ron(b.loanInstallment) }) : tr("fără credit nou")} tone={b.dscr < 1.25 ? "red" : undefined} />
      </div>

      <PlainLanguageCard a={assessment} />

      <Card className="mt-5">
        <CardHeader
          icon={<ChartColumn size={18} />}
          title={tr("Vânzări lunare și achiziții")}
          subtitle={tr("Vârf în {p}, minim în {t} · cash-flow operațional mediu {c}/lună", { p: monthLabel(m.peakMonth), t: monthLabel(m.troughMonth), c: ron(m.operatingCashFlow) })}
        />
        <MonthlyChart months={m.months} />
      </Card>

      <SeasonalityHeatmap />

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {b.items.map((i) => (
          <Card key={i.id} className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold leading-tight text-ink">{tr(i.label)}</p>
              <Badge tone="neutral">{Math.round(i.weight * 100)}%</Badge>
            </div>
            <p className="mt-3 text-sm font-medium text-ink">{tr(i.value)}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{tr(i.rule)}</p>
          </Card>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <PartyTable title={tr("Concentrarea pe clienți")} icon={<Users size={18} />} rows={m.topClients} total={tr("Top 5 din vânzările pe 12 luni ({v})", { v: ron(m.revenue12m) })} />
        <PartyTable title={tr("Principalii furnizori")} icon={<Truck size={18} />} rows={m.topSuppliers} total={tr("Top 5 din achizițiile pe 12 luni · marjă brută {m}", { m: pct(m.grossMarginPct) })} />
      </div>

      <div className="mt-5">
        <InvoiceTable invoices={invoices} />
      </div>

      <BenchmarkCard />

      <LoanSimulator />

      <LoanCostBreakdown />

      <StressTestPanel />

      <ProductComparator />

      <p className="mt-4 text-[11px] text-faint">
        {tr("Data încasării nu face parte din e-Factura: fără extrase bancare, DSO se calculează pe termenul de plată din factură (scadență − emitere). Rata nouă este estimată la {r}%/an pe {m} luni; cheltuielile fixe și ratele existente sunt cele declarate de tine.", { r: LOAN_ANNUAL_RATE * 100, m: investment.termMonths ?? LOAN_MONTHS })}
      </p>
    </>
  );
}
