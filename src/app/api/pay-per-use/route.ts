import { NextResponse, type NextRequest } from "next/server";
import type { Company } from "@/types/scoring";
import { PAY_PER_USE, payPerUseBreakdown } from "@/lib/pricing";
import { ensureCompany, getSupabase, unlockPayPerUse } from "@/lib/supabase/server";

/**
 * POST /api/pay-per-use — simulated checkout of one complete analysis (49 RON + TVA) for ONE company:
 * sets companies.pay_per_use_unlocked = true and counts purchased_credits. No card is charged (demo).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { company?: Company } | null;
  if (!body?.company?.id || !body.company.name) return NextResponse.json({ ok: false, error: "company { id, name } obligatoriu." }, { status: 400 });
  const invoice = { product: PAY_PER_USE.name, ...payPerUseBreakdown() };
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: true, mode: "local", unlocked: true, invoice });
  try {
    const company = await ensureCompany(sb, body.company);
    const r = await unlockPayPerUse(sb, company);
    return NextResponse.json({ ok: true, unlocked: true, credits: r.credits, invoice });
  } catch (e) {
    // The demo never blocks: the unlock still applies in the browser.
    return NextResponse.json({ ok: true, mode: "local", unlocked: true, invoice, error: e instanceof Error ? e.message : "eroare Supabase" });
  }
}
