"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ClipboardList, Eye, Handshake, LoaderCircle, LogOut, RefreshCw, ShieldAlert, ShieldCheck, Users, Wallet, X } from "lucide-react";
import type { AdminCompanyRow, AdminOverview } from "@/app/api/admin/overview/route";
import type { Company } from "@/types/scoring";
import type { AssessmentSnapshot } from "@/lib/history";
import { apiFetch } from "@/lib/auth/client";
import { formatRon, isBillingCycle, isPlanTier, monthlyPrice, PAY_PER_USE, type BillingModel } from "@/lib/pricing";
import { num } from "@/lib/util";
import { useAuth } from "../AuthProvider";
import { Badge, Button, Card, CardHeader, cx, inputCls, scoreTone, TONE_TEXT } from "../ui";
import { tr } from "@/lib/i18n/tr";
import { useLanguage } from "../LanguageProvider";

const PLAN_LABEL: Record<BillingModel, string> = { starter: "Starter", pro: "Pro", business: "Business", "pay-per-use": "Pay-Per-Use" };
const PLAN_TONE: Record<BillingModel, "neutral" | "emerald" | "blue" | "amber"> = { starter: "neutral", pro: "emerald", business: "blue", "pay-per-use": "amber" };
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ro-RO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * Supabase not configured: the same panel on the data saved in THIS browser
 * (localStorage of the evaluation flow). Clearly labeled as local.
 */
function localOverview(): AdminOverview {
  type Ws = { snapshots?: AssessmentSnapshot[]; history?: { date: string; score: number }[] };
  let companies: Company[] = [];
  let workspaces: Record<string, Ws> = {};
  let plans: Record<string, { planTier?: unknown; billingCycle?: unknown }> = {};
  try {
    const raw = JSON.parse(window.localStorage.getItem("credit-ready-v4") ?? "{}") as { companies?: Company[]; workspaces?: Record<string, Ws> };
    companies = raw.companies ?? [];
    workspaces = raw.workspaces ?? {};
    plans = JSON.parse(window.localStorage.getItem("credit-ready-plan") ?? "{}");
  } catch {
    /* storage unavailable: empty panel */
  }
  let mrr = 0;
  let ppu = 0;
  let evals = 0;
  const rows: AdminCompanyRow[] = companies.map((c) => {
    const p = plans[c.id] ?? {};
    const tier = isPlanTier(p.planTier) ? p.planTier : "starter";
    const cycle = isBillingCycle(p.billingCycle) ? p.billingCycle : "monthly";
    mrr += monthlyPrice(tier, cycle);
    if (c.payPerUseUnlocked) ppu += 1;
    const snaps = workspaces[c.id]?.snapshots ?? [];
    const daily = workspaces[c.id]?.history ?? [];
    evals += snaps.length;
    const last = snaps[snaps.length - 1];
    const lastDaily = daily[daily.length - 1];
    return {
      id: c.id,
      name: c.officialName || c.name,
      cui: c.cui,
      caenCode: c.caenCode,
      ceoName: c.ceoName,
      ceoCnpMasked: c.ceoCnpMasked ?? null,
      owner: c.userId ? "cont" : "guest",
      plan: tier === "starter" && c.payPerUseUnlocked ? "pay-per-use" : tier,
      billingCycle: cycle,
      lastScore: last?.finalScore ?? lastDaily?.score ?? null,
      lastStatus: last?.status ?? null,
      lastEvaluation: last?.createdAt ?? (lastDaily ? `${lastDaily.date}T00:00:00Z` : null),
      evaluations: snaps.length,
      createdAt: c.createdAt ?? null,
    };
  });
  return {
    kpis: { users: null, companies: companies.length, assessments: evals, leads: 0, mrr, payPerUseRevenue: ppu * PAY_PER_USE.price, payPerUseCount: ppu },
    companies: rows,
    leads: [],
    warnings: [tr("Supabase nu este configurat: panoul arată doar firmele și evaluările salvate în acest browser. Lead-urile B2B și utilizatorii necesită Supabase.")],
  };
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-card p-4 shadow-card">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <span className="text-faint [&_svg]:h-[14px] [&_svg]:w-[14px]">{icon}</span>
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-normal tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function QuickView({ row, onClose }: { row: AdminCompanyRow; onClose: () => void }) {
  const items: [string, string][] = [
    [tr("CUI"), row.cui || "—"],
    [tr("CAEN"), row.caenCode || "—"],
    [tr("Administrator"), row.ceoName || "—"],
    [tr("CNP (mascat)"), row.ceoCnpMasked ?? tr("nedeclarat")],
    [tr("Proprietar"), row.owner === "cont" ? tr("cont utilizator") : tr("mod Guest")],
    [tr("Plan"), `${PLAN_LABEL[row.plan]}${row.plan === "pro" || row.plan === "business" ? ` · ${row.billingCycle === "quarterly" ? tr("3 luni") : tr("lunar")}` : ""}`],
    [tr("Ultimul scor"), row.lastScore === null ? "—" : `${num(row.lastScore)} / 100${row.lastStatus ? ` · ${row.lastStatus}` : ""}`],
    [tr("Ultima evaluare"), dt(row.lastEvaluation)],
    [tr("Evaluări salvate"), String(row.evaluations)],
    [tr("Creată"), dt(row.createdAt)],
  ];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={row.name} className="animate-rise w-full max-w-[460px] rounded-[24px] bg-white p-6 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-faint">{tr("Profil firmă")}</p>
            <h2 className="text-lg font-medium tracking-tight text-ink">{row.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("Închide")} className="text-faint hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <dl className="mt-4 divide-y divide-line text-sm">
          {items.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** /admin — global KPIs, every company with its score and plan, B2B leads. Admins only. */
export function AdminPanel() {
  useLanguage(); // hydration-safe language for tr()
  const { isAdmin, loading, session, demoAdmin, refreshProfile } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [mode, setMode] = useState<"supabase" | "local" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<BillingModel | "all">("all");
  const [view, setView] = useState<AdminCompanyRow | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = (await apiFetch("/api/admin/overview").then((x) => x.json())) as { ok: boolean; mode?: string; error?: string; overview?: AdminOverview };
      if (r.ok && r.overview) {
        setData(r.overview);
        setMode("supabase");
      } else if (r.mode === "local") {
        setData(localOverview());
        setMode("local");
      } else setError(r.error ?? tr("Acces refuzat."));
    } catch {
      setError("API indisponibil.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the admin data once access is known
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.companies ?? []).filter((r) => (planFilter === "all" || r.plan === planFilter) && (!q || `${r.name} ${r.cui} ${r.ceoName}`.toLowerCase().includes(q)));
  }, [data, query, planFilter]);

  if (loading) return null;
  if (!isAdmin) {
    return (
      <Card className="mx-auto mt-6 max-w-[520px]">
        <CardHeader icon={<ShieldAlert size={18} />} title={tr("Acces doar pentru administratori")} subtitle={session ? tr("Contul tău are rolul „user”. Un admin îți poate schimba rolul în tabela profiles.") : tr("Autentifică-te cu un cont de administrator sau folosește accesul demo de pe pagina de autentificare.")} />
        <Link href="/login?next=/admin" className="inline-flex rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-white hover:bg-navy-2">
          Autentificare
        </Link>
      </Card>
    );
  }

  const k = data?.kpis;
  return (
    <div className="mt-2 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-faint">
            <ShieldCheck size={13} /> Panou de administrare {demoAdmin ? "· sesiune demo" : ""}
            {mode === "local" && <Badge tone="amber">date locale (browser)</Badge>}
            {mode === "supabase" && <Badge tone="emerald">Supabase live</Badge>}
          </p>
          <h1 className="mt-1 text-[28px] font-normal tracking-tight text-ink">CrediFit — Admin</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load()} disabled={busy}>
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} {tr("Reîncarcă")}
          </Button>
          {demoAdmin && (
            <Button
              variant="ghost"
              onClick={async () => {
                await fetch("/api/admin/demo", { method: "DELETE" });
                await refreshProfile();
              }}
            >
              <LogOut size={14} /> {tr("Ieși din demo")}
            </Button>
          )}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-soft px-4 py-3 text-sm text-red">{error}</p>}
      {data?.warnings.map((w) => (
        <p key={w} className="rounded-xl bg-amber-soft px-4 py-2.5 text-xs text-amber">
          {w}
        </p>
      ))}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={<Users />} label={tr("Total utilizatori")} value={k?.users === null || k === undefined ? "—" : num(k.users)} hint={tr("conturi Supabase Auth")} />
        <Kpi icon={<Building2 />} label={tr("Firme verificate")} value={k ? num(k.companies) : "—"} />
        <Kpi icon={<ClipboardList />} label={tr("Evaluări salvate")} value={k ? num(k.assessments) : "—"} hint={tr("assessment_history + assessments")} />
        <Kpi icon={<Handshake />} label={tr("Lead-uri B2B")} value={k ? num(k.leads) : "—"} />
        <Kpi
          icon={<Wallet />}
          label={tr("Venituri simulate")}
          value={k ? formatRon(k.mrr + k.payPerUseRevenue) : "—"}
          hint={k ? tr("{a}/lună abonamente + {b} pay-per-use ({c} analize)", { a: formatRon(k.mrr), b: formatRon(k.payPerUseRevenue), c: k.payPerUseCount }) : undefined}
        />
      </div>

      <Card>
        <CardHeader
          icon={<Building2 size={18} />}
          title={tr("Toate firmele")}
          subtitle={tr("{a} din {b} firme · scor și dată din ultima evaluare salvată", { a: rows.length, b: data?.companies.length ?? 0 })}
          action={
            <div className="flex flex-wrap gap-2">
              <input className={cx(inputCls, "w-56 py-2")} placeholder={tr("Caută nume, CUI, administrator")} value={query} onChange={(e) => setQuery(e.target.value)} />
              <select className={cx(inputCls, "w-40 py-2")} value={planFilter} onChange={(e) => setPlanFilter(e.target.value as BillingModel | "all")}>
                <option value="all">{tr("Toate planurile")}</option>
                {(Object.keys(PLAN_LABEL) as BillingModel[]).map((p) => (
                  <option key={p} value={p}>
                    {PLAN_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="text-faint">
              <tr>
                <th className="py-2 pr-3 font-semibold">{tr("Firmă")}</th>
                <th className="py-2 pr-3 font-semibold">{tr("Administrator")}</th>
                <th className="py-2 pr-3 text-right font-semibold">{tr("Scor")}</th>
                <th className="py-2 pr-3 font-semibold">{tr("Plan activ")}</th>
                <th className="py-2 pr-3 font-semibold">{tr("Ultima evaluare")}</th>
                <th className="py-2 pr-3 text-right font-semibold">{tr("Evaluări")}</th>
                <th className="py-2 text-right font-semibold">{tr("Profil")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-ink">{r.name}</p>
                    <p className="text-muted">
                      {r.cui || tr("fără CUI")} · CAEN {r.caenCode || "—"} · {r.owner === "cont" ? "cont" : "guest"}
                    </p>
                  </td>
                  <td className="py-2.5 pr-3 text-ink">
                    {r.ceoName || "—"}
                    {r.ceoCnpMasked && <p className="font-mono text-[10px] text-muted">{r.ceoCnpMasked}</p>}
                  </td>
                  <td className={cx("py-2.5 pr-3 text-right text-sm font-medium", r.lastScore === null ? "text-faint" : TONE_TEXT[scoreTone(r.lastScore)])}>{r.lastScore === null ? "—" : num(r.lastScore)}</td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={PLAN_TONE[r.plan]}>{PLAN_LABEL[r.plan]}</Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-ink">{dt(r.lastEvaluation)}</td>
                  <td className="py-2.5 pr-3 text-right text-ink">{r.evaluations}</td>
                  <td className="py-2.5 text-right">
                    <button type="button" onClick={() => setView(r)} className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] text-ink hover:border-line-strong">
                      <Eye size={12} /> Vezi
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted">
                    {busy ? tr("Se încarcă…") : tr("Nicio firmă.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Handshake size={18} />} title={tr("Lead-uri B2B")} subtitle={tr("Cererile „Solicită Demo B2B” din pagina de prețuri (tabela b2b_leads).")} />
        {(data?.leads.length ?? 0) === 0 ? (
          <p className="text-xs text-muted">{mode === "local" ? tr("Lead-urile se salvează doar în Supabase.") : tr("Niciun lead încă.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-faint">
                <tr>
                  <th className="py-2 pr-3 font-semibold">{tr("Data")}</th>
                  <th className="py-2 pr-3 font-semibold">{tr("Nume")}</th>
                  <th className="py-2 pr-3 font-semibold">{tr("Instituție")}</th>
                  <th className="py-2 pr-3 font-semibold">{tr("Contact")}</th>
                  <th className="py-2 font-semibold">{tr("Mesaj")}</th>
                </tr>
              </thead>
              <tbody>
                {data?.leads.map((l) => (
                  <tr key={l.id} className="border-t border-line align-top">
                    <td className="py-2.5 pr-3 text-muted">{dt(l.createdAt)}</td>
                    <td className="py-2.5 pr-3 font-medium text-ink">{l.fullName}</td>
                    <td className="py-2.5 pr-3 text-ink">{l.organization}</td>
                    <td className="py-2.5 pr-3 text-ink">
                      <a href={`mailto:${l.email}`} className="underline-offset-2 hover:underline">
                        {l.email}
                      </a>
                      {l.phone && <p className="text-muted">{l.phone}</p>}
                    </td>
                    <td className="py-2.5 text-muted">{l.message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {view && <QuickView row={view} onClose={() => setView(null)} />}
    </div>
  );
}
