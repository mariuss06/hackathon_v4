import Link from "next/link";
import { ArrowRight, Building2, Check } from "lucide-react";

const START_FEATURES = ["Verificare date publice CUI & CAEN", "Estimare inițială a scorului Credit Ready", "Încărcare până la 20 documente e-Factura"];

const PRO_FEATURES = [
  "Analiză nelimitată e-Factura & concentrare clienți",
  "Verificare completă litigii Portal Just & ANAF",
  "Plan personalizat 30–90 zile pentru creșterea scorului",
  "Descărcare Raport pentru Bancă (PDF) + Multi-firmă",
];

export function PricingPreview() {
  return (
    <section id="planuri" className="scroll-mt-24 py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-strong">Planuri transparente</span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Începe gratuit și treci la PRO când pregătești dosarul pentru bancă
          </h2>
          <p className="mt-3 text-sm text-muted sm:text-base">
            Fără costuri ascunse. Poți testa evaluarea inițială gratuit sau poți debloca analiza completă e-Factura și exportul PDF bancar.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          {/* Plan Start */}
          <div className="flex flex-col justify-between rounded-3xl border border-line bg-card p-7 shadow-card">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink">Plan Start</span>
                <span className="rounded-full bg-navy-soft/70 px-2.5 py-0.5 text-xs font-medium text-muted">Gratuit</span>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-ink">0 RON</span>
                <span className="text-xs text-muted">/ evaluare inițială</span>
              </div>
              <p className="mt-2 text-xs text-muted sm:text-sm">Ideal pentru o verificare rapidă a eligibilității generale a firmei tale.</p>

              <ul className="mt-6 space-y-3 text-xs text-ink sm:text-sm">
                {START_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5">
                    <Check size={14} strokeWidth={3} aria-hidden className="shrink-0 text-emerald-strong" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8">
              <Link
                href="/onboarding"
                className="block w-full rounded-full border border-line bg-card px-5 py-3 text-center text-xs font-semibold text-ink transition-colors hover:bg-canvas sm:text-sm"
              >
                Începe gratuit
              </Link>
            </div>
          </div>

          {/* Plan PRO */}
          <div className="relative flex flex-col justify-between rounded-3xl border-2 border-emerald/70 bg-card p-7 shadow-pop">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink">Plan PRO</span>
                <span className="rounded-full bg-emerald-soft px-2.5 py-0.5 text-xs font-semibold text-emerald-strong">Recomandat IMM</span>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-ink">149 RON</span>
                <span className="text-xs text-muted">/ lună · fără perioadă minimă</span>
              </div>
              <p className="mt-2 text-xs text-muted sm:text-sm">
                Diagnostic complet cu plan de acțiune 30–90 de zile și raport oficial PDF pentru bancă.
              </p>

              <ul className="mt-6 space-y-3 text-xs text-ink sm:text-sm">
                {PRO_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5">
                    <Check size={14} strokeWidth={3} aria-hidden className="shrink-0 text-emerald-strong" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8">
              <Link
                href="/pricing"
                className="block w-full rounded-full bg-navy px-5 py-3 text-center text-xs font-semibold text-white transition-colors hover:bg-navy-2 sm:text-sm"
              >
                Vezi toate detaliile planurilor →
              </Link>
            </div>
          </div>
        </div>

        {/* Business plan lives on its own page, so the pricing preview stays a clean 2-card choice. */}
        <div className="mx-auto mt-6 flex max-w-4xl flex-col items-start justify-between gap-4 rounded-3xl border border-line bg-card/70 px-5 py-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-soft text-emerald-strong">
              <Building2 size={16} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Plan Business &amp; Contabili</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                Firme nelimitate, alerte de risc și suport prioritar — pentru grupuri de firme, cabinete de contabilitate și brokeri de credite.
              </p>
            </div>
          </div>
          <Link
            href="/pricing/business"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-emerald-strong underline decoration-line underline-offset-4 transition-colors hover:text-ink"
          >
            Vezi planul Business <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
