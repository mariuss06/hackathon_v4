"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { createPortal } from "react-dom";
import { FileDown } from "lucide-react";
import { num, ron, getNumberLocale } from "@/lib/util";
import { useAssessment } from "./AssessmentProvider";
import { BrandLogo } from "./BrandLogo";
import { Button } from "./ui";
import { tr } from "@/lib/i18n/tr";

const STATUS_LABEL = { clean: "OK", warning: "Atenție", critical: "Critic", unavailable: "Indisponibil" } as const;

/** The one-page A4 "Fișă Pre-Calificare Bancă". Rendered into <body> and visible only while printing it. */
function Sheet() {
  const { assessment, company, official, verification, investment } = useAssessment();
  const f = assessment.final;
  const a = official.anaf;
  const top2 = [assessment.banks.top, ...assessment.banks.alternatives].filter(Boolean).slice(0, 2);
  const plan = [...assessment.plan].sort((x, y) => x.horizon - y.horizon || y.impactPoints - x.impactPoints).slice(0, 5);
  const generated = new Date().toLocaleString(getNumberLocale(), { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const rows: [string, string][] = [
    [tr("Denumire"), a?.denumire || company.officialName || company.name],
    ["CUI", a?.cui ? `RO${a.cui.replace(/\D/g, "")}`.replace(/^RORO/, "RO") : company.cui || "—"],
    [tr("Nr. Reg. Com."), a?.nrRegCom || "—"],
    [tr("Adresă"), a?.adresa || company.city || "—"],
    ["CAEN", a?.codCaen || company.caenCode || "—"],
    [tr("Administrator"), company.ceoName || "—"],
    [tr("CNP administrator"), company.ceoCnpMasked ?? tr("nedeclarat")],
  ];

  return (
    <div id="bank-report-sheet" aria-hidden>
      <div className="brs-head">
        <BrandLogo size="md" tagline />
        <div className="brs-right">
          <p className="brs-title">{tr("Fișă Pre-Calificare Bancă")}</p>
          <p>{tr("Generată:")} {generated}</p>
        </div>
      </div>
      <p className="brs-disclaimer">{tr("Raport de pre-calificare Credit Readiness — nu reprezintă aprobare bancară. Calculat pe date reale (e-Factura, ANAF, bilanț, VIES, ONRC, portal.just.ro) cu formulă publică.")}</p>

      <div className="brs-grid2">
        <section>
          <h3>{tr("Date oficiale ANAF")}</h3>
          <table>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h3>{tr("Cele 5 surse oficiale verificate")}</h3>
          <table>
            <tbody>
              {verification.sources.map((s) => (
                <tr key={s.sourceId}>
                  <th>{tr(s.name)}</th>
                  <td>
                    <strong>{tr(STATUS_LABEL[s.status])}</strong>
                    {s.score !== null ? ` · ${num(s.score)}/100` : ""} — {tr(s.summary)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="brs-score">
        <div className="brs-big">
          <p className="brs-label">{tr("Scor Credit Ready")}</p>
          <p className="brs-num">{f.complete ? num(f.finalScore) : "—"}<span>/100</span></p>
          <p className="brs-label">{f.complete ? tr(f.status) : tr("incomplet")}</p>
        </div>
        <div className="brs-pillars">
          {[
            ["S_Business (70%)", f.pillars.business.score],
            [tr("S_Uman (15%)"), f.pillars.human.score],
            [tr("S_Investiție (15%)"), f.pillars.investment.score],
          ].map(([l, v]) => (
            <div key={String(l)}>
              <p className="brs-label">{l}</p>
              <p className="brs-mid">{f.complete ? num(Number(v)) : "—"}</p>
            </div>
          ))}
          <div>
            <p className="brs-label">DSCR</p>
            <p className="brs-mid">{assessment.business.dscr >= 99 ? tr("fără datorii") : `${num(assessment.business.dscr)}×`}</p>
          </div>
          <div>
            <p className="brs-label">DSO</p>
            <p className="brs-mid">{tr("{n} zile", { n: num(assessment.metrics.dsoDays) })}</p>
          </div>
          <div>
            <p className="brs-label">{tr("Concentrare client #1")}</p>
            <p className="brs-mid">{num(assessment.metrics.topClientSharePct)}%</p>
          </div>
          <div>
            <p className="brs-label">{tr("Rată lunară estimată")}</p>
            <p className="brs-mid">{assessment.business.loanInstallment > 0 ? ron(assessment.business.loanInstallment) : "—"}</p>
          </div>
          <div>
            <p className="brs-label">{tr("Suma solicitată")}</p>
            <p className="brs-mid">{investment.requestedAmount ? ron(investment.requestedAmount) : "—"}</p>
          </div>
        </div>
      </section>

      <div className="brs-grid2">
        <section>
          <h3>{tr("Top 2 bănci recomandate")}</h3>
          {top2.map((b, i) => (
            <div key={b.id} className="brs-bank">
              <p>
                <strong>
                  {i + 1}. {b.bank}
                </strong>{" "}
                — {tr(b.product)}
              </p>
              <p>
                {tr("Potrivire")} {b.matchPct}% · {b.eligible ? tr("criterii minime îndeplinite") : tr("eligibilitate condiționată")} · {num(b.rateRangePct[0])}–{num(b.rateRangePct[1])}%{tr("/an")} · {tr(b.maturityLabel)} · {tr("aport")} {tr(b.minOwnLabel)}
                {b.monthlyCost > 0 ? ` · ${tr("rată")} ~${ron(b.monthlyCost)}${tr("/lună")}` : ""}
              </p>
            </div>
          ))}
        </section>
        <section>
          <h3>{tr("Plan de acțiune 30–90 de zile")}</h3>
          <ol>
            {plan.map((p) => (
              <li key={p.id}>
                <strong>{tr("{n} zile", { n: p.horizon })}:</strong> {tr(p.title)}
                {p.impactPoints > 0 ? ` (+${num(p.impactPoints)} pct)` : ""}
              </li>
            ))}
            {plan.length === 0 && <li>{tr("Nicio acțiune urgentă identificată.")}</li>}
          </ol>
        </section>
      </div>
      <p className="brs-foot">{tr("CrediFit · valori bancare orientative 2025–2026 · CNP afișat doar mascat (GDPR) · Decizia de creditare aparține exclusiv băncii.")}</p>
    </div>
  );
}

/** "Descarcă Raportul pentru Bancă (PDF)": prints only the one-page sheet (Save as PDF in the print dialog). */
export function BankReportPrint({ onBlocked, allowed }: { allowed: boolean; onBlocked: () => void }) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only after hydration
    setMounted(true);
    const off = () => delete document.body.dataset.print;
    window.addEventListener("afterprint", off);
    return () => window.removeEventListener("afterprint", off);
  }, []);
  const print = () => {
    if (!allowed) return onBlocked();
    document.body.dataset.print = "bank";
    window.print();
  };
  return (
    <>
      <Button onClick={print}>
        <FileDown size={15} /> {t.common.downloadBankPdf}
      </Button>
      {mounted && createPortal(<Sheet />, document.body)}
    </>
  );
}
