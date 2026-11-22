"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Building2, Check, CircleCheck, LoaderCircle, Sparkles, X } from "lucide-react";
import { useAssessment } from "./AssessmentProvider";
import { Badge, Button, cx } from "./ui";
import {
  formatRon,
  PAY_PER_USE,
  payPerUseBreakdown,
  PLAN_TIERS,
  PLANS,
  priceBreakdown,
  yearlySavings,
  YEARLY_DISCOUNT_PCT,
  type BillingCycle,
  type PlanTier,
} from "@/lib/pricing";
import { tr } from "@/lib/i18n/tr";
import { useLanguage } from "./LanguageProvider";

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-rise max-h-[calc(100vh-2rem)] w-full max-w-[460px] overflow-y-auto rounded-[24px] bg-white p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 className="text-lg font-medium tracking-tight text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label={tr("Închide")} className="text-faint hover:text-ink">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function BillingToggle({ value, onChange }: { value: BillingCycle; onChange: (v: BillingCycle) => void }) {
  return (
    <div role="radiogroup" aria-label={tr("Ciclu de facturare")} className="inline-flex rounded-full border border-line bg-white/80 p-1">
      {(
        [
          ["monthly", tr("Plată Lunară")],
          ["yearly", tr("Plată Anuală (Economisești {a}%)", { a: YEARLY_DISCOUNT_PCT })],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cx("rounded-full px-4 py-2 text-sm font-medium transition-colors", value === v ? "bg-navy text-white" : "text-muted hover:text-ink")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function PlanCard({
  tier,
  cycle,
  active,
  onChoose,
  featured = false,
}: {
  tier: PlanTier;
  cycle: BillingCycle;
  active: boolean;
  onChoose: () => void;
  /** Force the highlighted (emerald + raised) style — used by the dedicated Business plan page. */
  featured?: boolean;
}) {
  const plan = PLANS[tier];
  const price = plan.price[cycle];
  const savings = yearlySavings(tier);
  const highlighted = plan.highlighted || featured;
  return (
    <article
      className={cx(
        "relative flex flex-col rounded-[24px] bg-card p-6 shadow-card",
        highlighted ? "border-2 border-emerald lg:-translate-y-2" : "border border-white/80",
      )}
    >
      {plan.badge && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-emerald px-3 py-1 text-[11px] font-medium text-white">
          <Sparkles size={12} /> {tr(plan.badge)}
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-medium tracking-tight text-ink">{tr(plan.name)}</h3>
        {active && <Badge tone="emerald">{tr("Plan activ")}</Badge>}
      </div>
      <p className="mt-1 min-h-[40px] text-xs leading-relaxed text-muted">{tr(plan.subtitle)}</p>

      <div key={`${tier}-${cycle}`} className="animate-rise mt-5">
        <p className="flex items-baseline gap-1.5">
          <span className="text-[40px] font-light leading-none tracking-tight text-ink">{price}</span>
          <span className="text-sm text-muted">{tr("RON / lună")}</span>
        </p>
        <p className="mt-1.5 h-4 text-[11px] text-muted">
          {price === 0 ? tr("Gratuit, fără card") : cycle === "yearly" ? tr("Facturat anual: {a} · economisești {b}/an", { a: formatRon(price * 12), b: formatRon(savings) }) : tr("sau {a} RON/lună facturat anual", { a: plan.price.yearly })}
        </p>
      </div>

      <ul className="mt-6 flex-1 space-y-2.5">
        {plan.includes.map((item) => (
          <li key={item.text} className="flex items-start gap-2.5 text-sm leading-snug text-ink">
            <Check size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-emerald" />
            <span>
              {tr(item.text)}
              {item.roadmap && (
                <Badge tone="blue" className="ml-1.5 align-middle">
                  Roadmap
                </Badge>
              )}
            </span>
          </li>
        ))}
      </ul>

      <Button variant={highlighted ? "primary" : "secondary"} className="mt-7 w-full" onClick={onChoose} disabled={active}>
        {active ? "Plan Activ" : tr(plan.cta)}
      </Button>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Checkout (simulated, Stripe-style)
// ---------------------------------------------------------------------------

export function CheckoutModal({
  tier,
  initialCycle,
  onClose,
  onConfirmed,
}: {
  tier: PlanTier;
  initialCycle: BillingCycle;
  onClose: () => void;
  onConfirmed: (tier: PlanTier, cycle: BillingCycle) => void;
}) {
  const { company, supabase } = useAssessment();
  const [cycle, setCycle] = useState(initialCycle);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const plan = PLANS[tier];
  const b = priceBreakdown(tier, cycle);

  async function confirm() {
    setBusy(true);
    // Simulated payment delay, then the plan applies instantly everywhere (no reload).
    await new Promise((r) => setTimeout(r, 600));
    onConfirmed(tier, cycle);
    setDone(supabase?.configured && !supabase.error ? tr("Plan activat și salvat în Supabase.") : tr("Plan activat local (Supabase neconfigurat)."));
    setBusy(false);
  }

  return (
    <Modal title={done ? tr("Upgrade confirmat") : `Checkout — ${tr(plan.name)}`} onClose={onClose}>
      {done ? (
        <div className="text-center">
          <CircleCheck size={40} className="mx-auto text-emerald" />
          <p className="mt-3 text-sm text-ink">
            <strong className="font-medium">{company.name}</strong> {tr("este acum pe planul")} <strong className="font-medium">{tr(plan.name)}</strong>.
          </p>
          <p className="mt-1 text-xs text-muted">{done}</p>
          <Button className="mt-6 w-full" onClick={onClose}>
            Gata
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-line/70 bg-canvas p-4">
            <p className="flex items-center gap-2 text-xs text-muted">
              <Building2 size={13} /> {company.name}
            </p>
            <p className="mt-1 text-sm font-medium text-ink">{tr(plan.name)}</p>
            <p className="mt-0.5 text-xs text-muted">{tr(plan.subtitle)}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {(["monthly", "yearly"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className={cx(
                  "rounded-2xl border p-3 text-left transition-colors",
                  cycle === c ? "border-navy bg-navy text-white" : "border-line bg-white text-ink hover:border-line-strong",
                )}
              >
                <span className="block text-xs opacity-70">{c === "monthly" ? "Lunar" : `Anual (−${YEARLY_DISCOUNT_PCT}%)`}</span>
                <span className="mt-0.5 block text-sm font-medium">{plan.price[c]} RON {tr("/ lună")}</span>
              </button>
            ))}
          </div>

          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between text-muted">
              <dt>
                {b.perMonth} RON × {b.months} {b.months === 1 ? tr("lună") : tr("luni")} ({tr("fără TVA")})
              </dt>
              <dd className="text-ink">{b.net.toLocaleString("ro-RO")} RON</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>TVA {Math.round(b.vatRate * 100)}%</dt>
              <dd className="text-ink">{b.vat.toLocaleString("ro-RO")} RON</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 font-medium text-ink">
              <dt>Total {cycle === "yearly" ? "anual" : "lunar"} cu TVA</dt>
              <dd>{b.gross.toLocaleString("ro-RO")} RON</dd>
            </div>
          </dl>

          <Button className="mt-6 w-full" onClick={confirm} disabled={busy}>
            {busy && <LoaderCircle size={15} className="animate-spin" />}
            {tr("Confirmă Upgrade — Mod Demo Hackathon")}
          </Button>
          <p className="mt-2 text-center text-[11px] text-faint">{tr("Nu se percepe nicio plată: checkout simulat pentru demonstrație.")}</p>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Pay-per-use: one complete analysis for the active company (simulated checkout)
// ---------------------------------------------------------------------------

function PayPerUseCheckout({ onClose }: { onClose: () => void }) {
  const { company, unlockPayPerUse } = useAssessment();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const b = payPerUseBreakdown();
  async function confirm() {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 600));
    setDone(await unlockPayPerUse());
    setBusy(false);
  }
  return (
    <Modal title={done ? tr("Analiză deblocată") : "Checkout — Pay-Per-Use"} onClose={onClose}>
      {done ? (
        <div className="text-center">
          <CircleCheck size={40} className="mx-auto text-emerald" />
          <p className="mt-3 text-sm text-ink">{done}</p>
          <p className="mt-1 text-xs text-muted">{tr("Toate băncile, What-If, Stress Test și „Fișa Pre-Calificare Bancă” (PDF) sunt active pentru această firmă.")}</p>
          <Button className="mt-6 w-full" onClick={onClose}>
            Gata
          </Button>
        </div>
      ) : !company.id ? (
        <p className="text-sm text-muted">{tr("Adaugă întâi firma în Pasul 1: analiza Pay-Per-Use se deblochează pe o firmă anume.")}</p>
      ) : (
        <>
          <div className="rounded-2xl border border-line/70 bg-canvas p-4">
            <p className="flex items-center gap-2 text-xs text-muted">
              <Building2 size={13} /> {company.officialName || company.name}
            </p>
            <p className="mt-1 text-sm font-medium text-ink">{tr("Analiză completă — plată unică")}</p>
            <p className="mt-0.5 text-xs text-muted">{tr(PAY_PER_USE.subtitle)}</p>
          </div>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between text-muted">
              <dt>{tr("1 analiză completă (fără TVA)")}</dt>
              <dd className="text-ink">{b.net.toLocaleString("ro-RO")} RON</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>TVA {Math.round(b.vatRate * 100)}%</dt>
              <dd className="text-ink">{b.vat.toLocaleString("ro-RO")} RON</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 font-medium text-ink">
              <dt>{tr("Total cu TVA (o singură dată)")}</dt>
              <dd>{b.gross.toLocaleString("ro-RO")} RON</dd>
            </div>
          </dl>
          <Button className="mt-6 w-full" onClick={confirm} disabled={busy}>
            {busy && <LoaderCircle size={15} className="animate-spin" />}
            {tr("Plătește {p} RON — Mod Demo Hackathon", { p: PAY_PER_USE.price })}
          </Button>
          <p className="mt-2 text-center text-[11px] text-faint">{tr("Nu se percepe nicio plată: checkout simulat. Se salvează pay_per_use_unlocked pe firmă (Supabase).")}</p>
        </>
      )}
    </Modal>
  );
}

function PayPerUseCard({ onChoose }: { onChoose: () => void }) {
  const { payPerUse, company } = useAssessment();
  return (
    <section id="pay-per-use" className="mt-8 grid scroll-mt-6 gap-6 rounded-[24px] border border-amber/40 bg-card p-6 shadow-card sm:p-8 lg:grid-cols-[1fr_1.3fr] lg:items-center">
      <div>
        <Badge tone="amber">{tr("Fără abonament")}</Badge>
        <h3 className="mt-3 text-xl font-normal tracking-tight text-ink">{PAY_PER_USE.name} — {tr("Plată per utilizare")}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{tr(PAY_PER_USE.subtitle)}</p>
        <p className="mt-4 flex items-baseline gap-1.5">
          <span className="text-[40px] font-light leading-none tracking-tight text-ink">{PAY_PER_USE.price}</span>
          <span className="text-sm text-muted">{tr("RON / analiză completă")}</span>
        </p>
        <p className="mt-1 text-[11px] text-muted">{tr("plată unică pe firmă · {g} cu TVA", { g: formatRon(payPerUseBreakdown().gross) })}</p>
        <Button className="mt-5" onClick={onChoose} disabled={payPerUse}>
          {payPerUse ? tr("Deblocat pentru {a}", { a: company.name }) : tr(PAY_PER_USE.cta)}
        </Button>
      </div>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {PAY_PER_USE.includes.map((t) => (
          <li key={t} className="flex items-start gap-2.5 text-sm leading-snug text-ink">
            <Check size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-emerald" />
            {tr(t)}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export function PricingSection() {
  useLanguage(); // hydration-safe language for tr()
  const { plan, setPlan } = useAssessment();
  const [cycle, setCycle] = useState<BillingCycle>("yearly");
  const [checkout, setCheckout] = useState<PlanTier | null>(null);
  const [ppuOpen, setPpuOpen] = useState(false);

  function choose(tier: PlanTier) {
    if (tier === "starter") {
      setPlan("starter", cycle);
      return;
    }
    setCheckout(tier);
  }

  return (
    <div>
      <div className="flex flex-col items-center gap-3 text-center">
        <BillingToggle value={cycle} onChange={setCycle} />
        <p className="text-xs text-muted">
          {cycle === "yearly"
            ? tr("Economisești {a}/an la Pro și {b}/an la Business.", { a: formatRon(yearlySavings("pro")), b: formatRon(yearlySavings("business")) })
            : tr("Prețuri fără TVA. Poți anula oricând.")}
        </p>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {PLAN_TIERS.map((tier) => (
          <PlanCard key={tier} tier={tier} cycle={cycle} active={plan.planTier === tier} onChoose={() => choose(tier)} />
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        {tr("Pentru grupuri de firme și cabinete de contabilitate:")}{" "}
        <Link href="/pricing/business" className="font-medium text-emerald-strong underline decoration-line underline-offset-4 transition-colors hover:text-ink">
          {tr("vezi planul Business în detaliu →")}
        </Link>
      </p>

      <PayPerUseCard onChoose={() => setPpuOpen(true)} />

      {checkout && (
        <CheckoutModal
          tier={checkout}
          initialCycle={cycle}
          onClose={() => setCheckout(null)}
          onConfirmed={(planTier, billingCycle) => setPlan(planTier, billingCycle)}
        />
      )}
      {ppuOpen && <PayPerUseCheckout onClose={() => setPpuOpen(false)} />}
    </div>
  );
}
