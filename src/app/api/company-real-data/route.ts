import { NextResponse, type NextRequest } from "next/server";
import type { LegalCheckResult } from "@/types/scoring";
import { checkPortalJust } from "@/app/actions/checkPortalJust";
import { scoreRealData } from "@/lib/multi-source-verifier";
import { getCompanyRealData } from "@/lib/real-company-sources";

/** Several external calls (ANAF, VIES, portal.just.ro): allow up to 30 s on serverless hosts. */
export const maxDuration = 30;

interface Body {
  cui?: string;
  companyName?: string;
  ceoName?: string;
  companyCounty?: string;
  companyId?: string;
  /** false = skip portal.just.ro (the browser runs it separately and keeps the user's confirmations). */
  includePortal?: boolean;
  /** A portal.just.ro result already in hand (with the user's confirmations). */
  legal?: LegalCheckResult | null;
}

/**
 * POST /api/company-real-data — real data about the company from 5 official sources, queried in parallel:
 * ANAF (v9), ANAF balance sheets, portal.just.ro, VIES and the ONRC legal state (+ insolvency cases).
 * Nothing is ever invented: each source reports verified / not_found / requires_cui / unavailable.
 * Body: { cui?, companyName?, ceoName?, companyCounty?, includePortal? }.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || (!body.cui?.trim() && !body.companyName?.trim())) {
    return NextResponse.json({ ok: false, error: "Trimite cel puțin { cui } sau { companyName }." }, { status: 400 });
  }
  const runPortal = body.includePortal !== false && !body.legal;
  const real = await getCompanyRealData(
    { cui: body.cui, companyName: body.companyName, ceoName: body.ceoName, companyCounty: body.companyCounty },
    { legal: body.legal ?? null, checkPortal: runPortal ? checkPortalJust : undefined },
  );
  const report = scoreRealData(real, real.legal, { companyId: body.companyId ?? "", companyName: real.anaf?.denumire || body.companyName || "", ceoName: body.ceoName ?? "" });
  return NextResponse.json({ ok: true, real, report });
}
