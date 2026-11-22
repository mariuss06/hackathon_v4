import { connection, NextResponse, type NextRequest } from "next/server";
import { getSupabase, listCompanies, upsertCompany, type UpsertCompanyInput } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/server";

/**
 * GET /api/companies — saved companies (none is ever deleted), oldest first.
 * Signed in (Bearer token): the account's companies. Guest mode: companies that belong to no account.
 */
export async function GET(request: NextRequest) {
  await connection();
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ supabase: { configured: false }, companies: [] });
  try {
    return NextResponse.json({ supabase: { configured: true }, companies: await listCompanies(sb, (await getRequestUser(request))?.id ?? null) });
  } catch (e) {
    return NextResponse.json({ supabase: { configured: true, error: e instanceof Error ? e.message : "eroare Supabase" }, companies: [] });
  }
}

/**
 * POST /api/companies — step 1 "save company".
 * Body: { name, ceoName, cui?, caenCode?, sector?, id? }. Name and CEO are required; CUI and CAEN are optional.
 * Finds the company by CUI (if given) or by normalized name; creates it otherwise and
 * returns it with no invoices: only uploaded e-Factura adds them (no invented history).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Partial<UpsertCompanyInput> | null;
  const name = body?.name?.trim() ?? "";
  const ceoName = body?.ceoName?.trim() ?? "";
  if (!name || !ceoName) {
    return NextResponse.json({ ok: false, error: "Numele firmei și numele administratorului sunt obligatorii." }, { status: 400 });
  }
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, mode: "local", message: "Supabase neconfigurat — firma se salvează doar în browser." });
  try {
    const user = await getRequestUser(request);
    // The masked CNP is accepted only in its masked form; a raw 13-digit CNP is never stored.
    const masked = typeof body?.ceoCnpMasked === "string" && /^\d{7}\*{6}$/.test(body.ceoCnpMasked) ? body.ceoCnpMasked : undefined;
    const r = await upsertCompany(sb, { ...body, name, ceoName, ceoCnpMasked: masked, ceoCnpInfo: masked ? body?.ceoCnpInfo : undefined, userId: user?.id ?? null });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "eroare Supabase" }, { status: 500 });
  }
}
