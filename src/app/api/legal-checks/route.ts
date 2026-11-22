import { NextResponse, type NextRequest } from "next/server";
import type { Company, LegalCheckResult } from "@/types/scoring";
import { ensureCompany, getSupabase, saveLegalCheck } from "@/lib/supabase/server";

/** POST /api/legal-checks — store a portal.just.ro check in the history of ONE company (legal_checks). */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { company?: Company; result?: LegalCheckResult } | null;
  if (!body?.company?.id || !body.result) return NextResponse.json({ saved: false, error: "Body: { company, result } obligatoriu." }, { status: 400 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ saved: false, mode: "local" });
  try {
    const company = await ensureCompany(sb, body.company);
    await saveLegalCheck(sb, company, body.result);
    return NextResponse.json({ saved: true });
  } catch (e) {
    return NextResponse.json({ saved: false, error: e instanceof Error ? e.message : "eroare Supabase" }, { status: 500 });
  }
}
