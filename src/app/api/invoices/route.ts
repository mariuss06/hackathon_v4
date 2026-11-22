import { NextResponse, type NextRequest } from "next/server";
import type { Company, Invoice } from "@/types/scoring";
import { ensureCompany, findCompanyById, getSupabase, invoiceToRow } from "@/lib/supabase/server";

interface Body {
  /** The active company (created in Supabase if it only existed in the browser so far). */
  company: Company;
  invoices: Invoice[];
  /** Original XML per invoice id, stored for audit. */
  rawXml?: Record<string, string>;
}

/**
 * POST /api/invoices — persist invoices parsed from uploaded e-Factura.
 * They are attached to the ACTIVE company only (company_id); other companies' invoices are untouched.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.company?.id || !body.company.name || !Array.isArray(body.invoices)) {
    return NextResponse.json({ persisted: false, error: "Body invalid: company { id, name } și invoices[] sunt obligatorii." }, { status: 400 });
  }
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ persisted: false, mode: "local", message: "Supabase neconfigurat — facturile rămân salvate în browser, pe firma activă." });

  try {
    const company = await ensureCompany(sb, body.company);
    const rows = body.invoices.map((inv) => invoiceToRow({ ...inv, source: "xml-upload" }, company, body.rawXml?.[inv.id]));
    const { error } = await sb.from("e_invoices").upsert(rows, { onConflict: "company_id,id" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ persisted: true, count: rows.length, companyId: company.id });
  } catch (e) {
    return NextResponse.json({ persisted: false, error: e instanceof Error ? e.message : "eroare Supabase" }, { status: 500 });
  }
}

/** DELETE /api/invoices?companyId=<uuid> — remove the uploaded XML invoices of ONE company (demo reset). Synthetic history stays. */
export async function DELETE(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const sb = getSupabase();
  if (!sb || !companyId) return NextResponse.json({ deleted: false, mode: "local" });
  const company = await findCompanyById(sb, companyId).catch(() => null);
  if (!company) return NextResponse.json({ deleted: false });
  const { error } = await sb.from("e_invoices").delete().eq("company_id", company.id).eq("source", "xml-upload");
  return NextResponse.json({ deleted: !error, error: error?.message });
}
