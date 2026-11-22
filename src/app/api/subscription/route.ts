import { connection, NextResponse, type NextRequest } from "next/server";
import type { Company } from "@/types/scoring";
import { DEFAULT_BILLING, DEFAULT_PLAN, getPlan, isBillingCycle, isPlanTier, priceBreakdown } from "@/lib/pricing";
import { ensureCompany, getSubscription, getSupabase, setSubscription } from "@/lib/supabase/server";

/** GET /api/subscription?companyId=<uuid> — the company's plan (Starter when none is stored). */
export async function GET(request: NextRequest) {
  await connection();
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId obligatoriu." }, { status: 400 });
  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ ok: true, mode: "local", subscription: { companyId, planTier: DEFAULT_PLAN, billingCycle: DEFAULT_BILLING, status: "active", updatedAt: null } });
  }
  try {
    return NextResponse.json({ ok: true, subscription: await getSubscription(sb, companyId) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "eroare Supabase" }, { status: 500 });
  }
}

/**
 * POST /api/subscription — simulated checkout ("Confirmă Upgrade — Mod Demo Hackathon"), no card involved.
 * Body: { company, planTier: "starter" | "pro" | "business", billingCycle: "monthly" | "yearly" }.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { company?: Company; planTier?: unknown; billingCycle?: unknown } | null;
  if (!body?.company?.id || !body.company.name) return NextResponse.json({ ok: false, error: "company { id, name } obligatoriu." }, { status: 400 });
  if (!isPlanTier(body.planTier)) return NextResponse.json({ ok: false, error: "planTier: starter | pro | business." }, { status: 400 });
  const planTier = body.planTier;
  const billingCycle = isBillingCycle(body.billingCycle) ? body.billingCycle : DEFAULT_BILLING;
  const invoice = { plan: getPlan(planTier).name, ...priceBreakdown(planTier, billingCycle) };

  const sb = getSupabase();
  const local = { companyId: body.company.id, planTier, billingCycle, status: "active" as const, updatedAt: new Date().toISOString() };
  if (!sb) return NextResponse.json({ ok: true, mode: "local", subscription: local, invoice });
  try {
    const company = await ensureCompany(sb, body.company);
    return NextResponse.json({ ok: true, subscription: await setSubscription(sb, company, planTier, billingCycle), invoice });
  } catch (e) {
    // The demo never blocks: the plan still applies in the browser.
    return NextResponse.json({ ok: true, mode: "local", subscription: local, invoice, error: e instanceof Error ? e.message : "eroare Supabase" });
  }
}
