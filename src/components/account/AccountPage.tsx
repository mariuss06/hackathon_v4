"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, FlaskConical, LogOut, ShieldCheck, UserRound } from "lucide-react";
import type { Company } from "@/types/scoring";
import { apiFetch } from "@/lib/auth/client";
import { useAuth } from "../AuthProvider";
import { useLanguage } from "../LanguageProvider";
import { Badge, Button, Card, CardHeader } from "../ui";

/** "Contul meu": the account, its role and the companies linked to it. */
export function AccountPage() {
  const { session, profile, isAdmin, signOut, loading, configured, demoSession } = useAuth();
  const { t } = useLanguage();
  const p = t.accountPage;
  const [companies, setCompanies] = useState<Company[] | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    apiFetch("/api/companies")
      .then((r) => r.json())
      .then((d: { companies?: Company[] }) => !cancelled && setCompanies(d.companies ?? []))
      .catch(() => !cancelled && setCompanies([]));
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (loading) return null;
  // Instant Demo session: a simulated account (no Supabase user, nothing sent to the server).
  if (!session && demoSession) {
    return (
      <Card className="mx-auto mt-6 max-w-[560px]">
        <CardHeader icon={<FlaskConical size={18} />} title={p.demoTitle} subtitle={demoSession.email} action={<Badge tone="navy">{t.account.demoBadge}</Badge>} />
        <p className="mb-4 text-sm leading-relaxed text-muted">{p.demoLead}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/profil" className="rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-2">
            {p.demoOpen}
          </Link>
          <Button variant="ghost" onClick={() => void signOut()}>
            <LogOut size={14} /> {p.demoExit}
          </Button>
        </div>
      </Card>
    );
  }
  if (!session) {
    return (
      <Card className="mx-auto mt-6 max-w-[520px]">
        <CardHeader icon={<UserRound size={18} />} title={p.title} subtitle={configured ? p.notSignedIn : p.guestOnly} />
        <div className="flex flex-wrap gap-2">
          {configured && (
            <Link href="/login?next=/cont" className="rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-2">
              {t.account.signIn}
            </Link>
          )}
          <Link href="/login" className="inline-flex items-center gap-1.5 rounded-full border border-navy/20 bg-navy-soft/60 px-5 py-2.5 text-sm font-medium text-navy-3 hover:border-navy/40">
            <FlaskConical size={14} /> {t.auth.demoCta}
          </Link>
          <Link href="/onboarding" className="rounded-full border border-line px-5 py-2.5 text-sm text-ink hover:border-line-strong">
            {p.continueGuest}
          </Link>
          {isAdmin && (
            <Link href="/admin" className="rounded-full border border-line px-5 py-2.5 text-sm text-ink hover:border-line-strong">
              {p.adminPanelDemo}
            </Link>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto mt-6 grid max-w-[880px] gap-5">
      <Card>
        <CardHeader
          icon={<UserRound size={18} />}
          title={profile?.fullName || session.user.email || p.title}
          subtitle={session.user.email ?? ""}
          action={<Badge tone={profile?.role === "admin" ? "emerald" : "neutral"}>{profile?.role === "admin" ? p.roleAdmin : p.roleUser}</Badge>}
        />
        <div className="flex flex-wrap gap-2">
          <Link href="/onboarding" className="rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-2">
            {p.goToEvaluation}
          </Link>
          {isAdmin && (
            <Link href="/admin" className="inline-flex items-center gap-1.5 rounded-full border border-line px-5 py-2.5 text-sm text-ink hover:border-line-strong">
              <ShieldCheck size={14} /> {p.adminPanel}
            </Link>
          )}
          <Button variant="ghost" onClick={() => void signOut()}>
            <LogOut size={14} /> {t.account.signOut}
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader icon={<Building2 size={18} />} title={p.companiesTitle} subtitle={p.companiesLead} />
        {companies === null ? (
          <p className="text-xs text-muted">{t.common.loading}</p>
        ) : companies.length === 0 ? (
          <p className="text-xs text-muted">{p.noCompanies}</p>
        ) : (
          <ul className="divide-y divide-line">
            {companies.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-ink">{c.officialName || c.name}</p>
                  <p className="text-[11px] text-muted">
                    {c.cui || t.common.noCui} · CAEN {c.caenCode || "—"} · {c.ceoName}
                    {c.ceoCnpMasked ? ` · CNP ${c.ceoCnpMasked}` : ""}
                  </p>
                </div>
                {c.payPerUseUnlocked && <Badge tone="emerald">Pay-Per-Use</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
