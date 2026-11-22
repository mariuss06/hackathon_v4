import { connection, NextResponse, type NextRequest } from "next/server";
import { loadDataset } from "@/lib/supabase/server";

/**
 * GET /api/dataset?companyId=<uuid>   (or the legacy ?cui=RO45127893)
 * The company and ONLY its e-Factura invoices (filtered by company_id), from Supabase,
 * or an empty list when Supabase is not configured or the company is unknown (never invented data).
 */
export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const ref = params.get("companyId") ?? params.get("cui");
  if (!ref) return NextResponse.json({ ok: false, error: "Parametru lipsă: companyId sau cui." }, { status: 400 });
  return NextResponse.json(await loadDataset(ref));
}
