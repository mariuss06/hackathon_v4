import { connection, NextResponse, type NextRequest } from "next/server";
import { getAdminAccess } from "@/lib/auth/server";
import { getSupabase, listAllCompanies } from "@/lib/supabase/server";
import { isBillingCycle, isPlanTier, monthlyPrice, PAY_PER_USE, type BillingModel } from "@/lib/pricing";

export interface AdminCompanyRow {
  id: string;
  name: string;
  cui: string;
  caenCode: string;
  ceoName: string;
  ceoCnpMasked: string | null;
  owner: "cont" | "guest";
  plan: BillingModel;
  billingCycle: string;
  lastScore: number | null;
  lastStatus: string | null;
  lastEvaluation: string | null;
  evaluations: number;
  createdAt: string | null;
}

export interface AdminOverview {
  kpis: {
    users: number | null;
    companies: number;
    assessments: number;
    leads: number;
    /** Simulated monthly recurring revenue from active subscriptions (RON, VAT-exclusive). */
    mrr: number;
    /** Simulated one-off revenue from pay-per-use analyses (RON, VAT-exclusive). */
    payPerUseRevenue: number;
    payPerUseCount: number;
  };
  companies: AdminCompanyRow[];
  leads: { id: string; fullName: string; organization: string; email: string; phone: string | null; message: string | null; createdAt: string }[];
  warnings: string[];
}

type Row = Record<string, unknown>;

/** GET /api/admin/overview — global KPIs + all companies + B2B leads. Admins only (role 'admin' or demo cookie). */
export async function GET(request: NextRequest) {
  await connection();
  const access = await getAdminAccess(request);
  if (!access.admin) return NextResponse.json({ ok: false, error: "Acces doar pentru administratori." }, { status: 403 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, mode: "local", error: "Supabase neconfigurat: panoul arată doar datele din acest browser." });

  const warnings: string[] = [];
  const safe = async <T,>(label: string, run: () => PromiseLike<{ data: T | null; error: { message: string } | null; count?: number | null }>) => {
    try {
      const r = await run();
      if (r.error) {
        warnings.push(`${label}: ${r.error.message}`);
        return { data: null as T | null, count: null as number | null };
      }
      return { data: r.data, count: r.count ?? null };
    } catch (e) {
      warnings.push(`${label}: ${e instanceof Error ? e.message : "eroare"}`);
      return { data: null as T | null, count: null as number | null };
    }
  };

  try {
    const companies = await listAllCompanies(sb);
    const [subs, history, assessments, leads, profiles] = await Promise.all([
      safe<Row[]>("subscriptions", () => sb.from("subscriptions").select("*")),
      safe<Row[]>("assessment_history", () => sb.from("assessment_history").select("company_id, final_score, status, created_at").order("created_at", { ascending: false }).limit(5000)),
      safe<Row[]>("assessments", () => sb.from("assessments").select("company_id, final_score, status, created_at").order("created_at", { ascending: false }).limit(5000)),
      safe<Row[]>("b2b_leads", () => sb.from("b2b_leads").select("*").order("created_at", { ascending: false }).limit(500)),
      safe<unknown>("profiles", () => sb.from("profiles").select("id", { count: "exact", head: true })),
    ]);

    const subByCompany = new Map((subs.data ?? []).map((s) => [String(s.company_id), s]));
    // Latest evaluation per company: assessment_history first, older `assessments` rows as fallback.
    const evals = [...(history.data ?? []), ...(assessments.data ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const latest = new Map<string, Row>();
    const counts = new Map<string, number>();
    for (const e of evals) {
      const id = String(e.company_id);
      if (!latest.has(id)) latest.set(id, e);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    let mrr = 0;
    let payPerUseCount = 0;
    const rows: AdminCompanyRow[] = companies.map((c) => {
      const sub = subByCompany.get(c.id);
      const tier = isPlanTier(sub?.plan_tier) ? sub.plan_tier : "starter";
      const cycle = isBillingCycle(sub?.billing_cycle) ? sub.billing_cycle : "monthly";
      const credits = Number(sub?.purchased_credits ?? 0) || (c.payPerUseUnlocked ? 1 : 0);
      payPerUseCount += credits;
      if (sub?.status !== "canceled") mrr += monthlyPrice(tier, cycle);
      const plan: BillingModel = tier === "starter" && (c.payPerUseUnlocked || credits > 0) ? "pay-per-use" : tier;
      const last = latest.get(c.id);
      return {
        id: c.id,
        name: c.officialName || c.name,
        cui: c.cui,
        caenCode: c.caenCode,
        ceoName: c.ceoName,
        ceoCnpMasked: c.ceoCnpMasked ?? null,
        owner: c.userId ? "cont" : "guest",
        plan,
        billingCycle: cycle,
        lastScore: last ? Number(last.final_score) : null,
        lastStatus: last ? String(last.status ?? "") : null,
        lastEvaluation: last ? String(last.created_at) : null,
        evaluations: counts.get(c.id) ?? 0,
        createdAt: c.createdAt ?? null,
      };
    });

    const overview: AdminOverview = {
      kpis: {
        users: profiles.count,
        companies: companies.length,
        assessments: (history.data?.length ?? 0) + (assessments.data?.length ?? 0),
        leads: leads.data?.length ?? 0,
        mrr,
        payPerUseRevenue: payPerUseCount * PAY_PER_USE.price,
        payPerUseCount,
      },
      companies: rows,
      leads: (leads.data ?? []).map((l) => ({
        id: String(l.id),
        fullName: String(l.full_name ?? ""),
        organization: String(l.organization ?? ""),
        email: String(l.email ?? ""),
        phone: l.phone ? String(l.phone) : null,
        message: l.message ? String(l.message) : null,
        createdAt: String(l.created_at ?? ""),
      })),
      warnings,
    };
    return NextResponse.json({ ok: true, via: access.via, overview });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "eroare Supabase" }, { status: 500 });
  }
}
