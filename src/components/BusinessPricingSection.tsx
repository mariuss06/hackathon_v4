"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Building2, Check, Layers, ShieldAlert, Sparkles, Users, Zap } from "lucide-react";
import { formatRon, PLANS, quarterlySavings, type BillingCycle } from "@/lib/pricing";
import { useAssessment } from "./AssessmentProvider";
import { BillingToggle, CheckoutModal, PlanCard } from "./PricingSection";
import { Card, CardHeader } from "./ui";
import { tr } from "@/lib/i18n/tr";
import { useLanguage } from "./LanguageProvider";

const AUDIENCE = [
  { title: "Grupuri de firme / holdinguri", detail: "Mai multe SRL-uri în același profil, fiecare cu facturile și evaluările ei." },
  { title: "Cabinete de contabilitate", detail: "Pregătești dosare de finanțare pentru clienți, cu rapoarte standardizate." },
  { title: "Brokeri de credite & consultanți", detail: "Compari rapid eligibilitatea mai multor firme înainte de a le trimite la bancă." },
  { title: "Firme cu 4+ entități", detail: "Peste limita de 3 firme a planului Pro, fără conturi suplimentare." },
];

const BUSINESS_EXTRAS = [
  { icon: Building2, title: "Firme nelimitate", detail: "Câte SRL-uri vrei, cu selector rapid multi-company și date separate pentru fiecare." },
  { icon: ShieldAlert, title: "Alerte automate de risc", detail: "DSCR sub 1,25×, concentrare client peste 40%, stornări peste 5% — semnalate imediat." },
  { icon: Zap, title: "Sincronizare SPV & Open Banking", detail: "Import automat al facturilor e-Factura, fără upload manual. (Roadmap / integrare API)" },
  { icon: Users, title: "Onboarding & suport prioritar", detail: "Sesiune de pornire și răspuns prioritar pentru contul tău și firmele lui." },
];

/**
 * Dedicated page for the Business plan (groups of companies, accountants, credit brokers).
 * Built with the exact same visual language as /pricing: PlanCard, billing toggle and simulated checkout.
 */
export function BusinessPricingSection() {
  useLanguage(); // hydration-safe language for tr()
  const { plan, setPlan } = useAssessment();
  const [cycle, setCycle] = useState<BillingCycle>("quarterly");
  const [checkout, setCheckout] = useState(false);
  const business = PLANS.business;

  return (
    <div className="space-y-10">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-strong">Plan Business &amp; Contabili</p>
        <h1 className="mt-2 text-[28px] font-normal leading-tight tracking-tight text-ink sm:text-[34px]">
          {tr("Toate firmele tale, într-un singur loc")}
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          {tr("Pentru grupuri de firme, cabinete de contabilitate și brokeri de credite: analiză Credit Ready pentru firme nelimitate, alerte de risc și suport prioritar — cu toate funcționalitățile din Planul Pro incluse.")}
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <BillingToggle value={cycle} onChange={setCycle} />
        <p className="text-xs text-muted">
          {cycle === "quarterly" ? tr("Economisești {a} cu pachetul de 3 luni.", { a: formatRon(quarterlySavings("business")) }) : tr("Prețuri fără TVA. Poți anula oricând.")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        <PlanCard tier="business" cycle={cycle} active={plan.planTier === "business"} onChoose={() => setCheckout(true)} featured />

        <div className="space-y-5">
          <Card>
            <CardHeader
              icon={<Layers size={18} />}
              title={tr("Ce primești în plus față de Planul Pro")}
              subtitle={tr("Business · {a} RON/lună, cu toate funcționalitățile Pro incluse.", { a: business.price[cycle] })}
            />
            <ul className="grid gap-4 sm:grid-cols-2">
              {BUSINESS_EXTRAS.map((item) => (
                <li key={item.title} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-soft text-emerald-strong">
                    <item.icon size={15} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{tr(item.title)}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{tr(item.detail)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader icon={<Users size={18} />} title={tr("Pentru cine este planul Business")} subtitle={tr("Dacă răspunzi „da” la oricare dintre ele, e planul potrivit.")} />
            <ul className="space-y-3">
              {AUDIENCE.map((item) => (
                <li key={item.title} className="flex items-start gap-2.5 text-sm leading-snug text-ink">
                  <Check size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-emerald" />
                  <span>
                    <strong className="font-medium">{tr(item.title)}</strong>
                    <span className="text-muted"> — {tr(item.detail)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-2"
            >
              {tr("Compară toate planurile")} <ArrowRight size={15} />
            </Link>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-canvas"
            >
              {tr("Încearcă întâi gratuit")}
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-line bg-card p-6 shadow-card sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-soft text-emerald-strong">
              <Sparkles size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{tr("Nu ești sigur ce plan ți se potrivește?")}</p>
              <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-muted">
                {tr("Planul Starter e gratuit (1 firmă, 3 XML). Planul Pro acoperă până la 3 firme. Business e pentru portofolii mai mari și parteneri.")}
              </p>
            </div>
          </div>
          <Link href="/pricing" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-strong underline decoration-line underline-offset-4 hover:text-ink">
            Vezi tabelul comparativ complet →
          </Link>
        </div>
      </div>

      {checkout && (
        <CheckoutModal
          tier="business"
          initialCycle={cycle}
          onClose={() => setCheckout(false)}
          onConfirmed={(tier, billingCycle) => setPlan(tier, billingCycle)}
        />
      )}
    </div>
  );
}
