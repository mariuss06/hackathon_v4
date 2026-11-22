import { connection, NextResponse, type NextRequest } from "next/server";
import type { AssessmentSnapshot } from "@/lib/history";
import { getRequestUser } from "@/lib/auth/server";
import { ensureCompany, getSupabase, insertHistory, listHistory } from "@/lib/supabase/server";
import type { Company } from "@/types/scoring";

/** GET /api/history?companyId=<uuid> — every saved evaluation snapshot of the company, oldest first. */
export async function GET(request: NextRequest) {
  await connection();
  const companyId = request.nextUrl.searchParams.get("companyId") ?? "";
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId obligatoriu." }, { status: 400 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: true, mode: "local", history: [] });
  try {
    return NextResponse.json({ ok: true, history: await listHistory(sb, companyId) });
  } catch (e) {
    return NextResponse.json({ ok: false, history: [], error: e instanceof Error ? e.message : "eroare Supabase" });
  }
}

const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** POST /api/history — stores one snapshot (never overwrites older ones). Body: { company, snapshot }. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { company?: Company; snapshot?: AssessmentSnapshot } | null;
  const s = body?.snapshot;
  if (!body?.company?.id || !s?.id || ![s.finalScore, s.sBusiness, s.sUman, s.sInvestitie, s.dso, s.clientConcentration].every(finite)) {
    return NextResponse.json({ ok: false, error: "Body invalid: { company, snapshot }." }, { status: 400 });
  }
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: true, mode: "local", persisted: false });
  try {
    const user = await getRequestUser(request);
    const company = await ensureCompany(sb, body.company);
    await insertHistory(sb, { ...s, companyId: company.id, userId: user?.id ?? null, createdAt: s.createdAt || new Date().toISOString() });
    return NextResponse.json({ ok: true, persisted: true });
  } catch (e) {
    return NextResponse.json({ ok: false, persisted: false, error: e instanceof Error ? e.message : "eroare Supabase" });
  }
}
