import { NextResponse, type NextRequest } from "next/server";
import { getRequestUser } from "@/lib/auth/server";
import { claimCompanies, getSupabase } from "@/lib/supabase/server";

/**
 * POST /api/account/claim — after sign-in, links the companies created in guest mode in this browser
 * to the account. Only companies that belong to nobody are claimed. Body: { companyIds: string[] }.
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "Autentificare necesară." }, { status: 401 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, mode: "local", claimed: 0 });
  const body = (await request.json().catch(() => null)) as { companyIds?: unknown } | null;
  const ids = Array.isArray(body?.companyIds) ? body.companyIds.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  try {
    return NextResponse.json({ ok: true, claimed: await claimCompanies(sb, user.id, ids) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "eroare Supabase" }, { status: 500 });
  }
}
