import { NextResponse, type NextRequest } from "next/server";
import type { Company, LegalCheckResult } from "@/types/scoring";
import { checkPortalJust } from "@/app/actions/checkPortalJust";
import { computeHumanScore, verifyAllSources } from "@/lib/multi-source-verifier";
import { companyCounty } from "@/lib/scoringEngine";
import { ensureCompany, getSupabase, saveVerificationReport } from "@/lib/supabase/server";

/** Several external calls (ANAF, VIES, portal.just.ro): allow up to 30 s on serverless hosts. */
export const maxDuration = 30;

interface Body {
  /** The active company (preferred: the report is then stored on it in Supabase). */
  company?: Company;
  /** Or the bare identity, when no Company object is at hand. */
  companyId?: string;
  companyName?: string;
  ceoName?: string;
  cui?: string | null;
  companyCounty?: string;
  /** A portal.just.ro result the browser already has (keeps the user's confirm / dispute answers); otherwise it is run here. */
  legal?: LegalCheckResult | null;
  /** When given, the response also carries S_Uman = 0.5·Quiz + 0.5·ScorVerificariExterne. */
  quizScore?: number;
}

/**
 * POST /api/verify-sources — ScorVerificariExterne (0-100) from the 5 real official sources
 * (portal.just.ro, ANAF, ANAF balance sheets, VIES, ONRC legal state). Sources that do not answer are
 * left out of the weighted mean; with no answer at all the score is null. Stored in Supabase when configured.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const c = body?.company;
  const companyName = (c?.name ?? body?.companyName ?? "").trim();
  const ceoName = (c?.ceoName ?? body?.ceoName ?? "").trim();
  if (!companyName || !ceoName) {
    return NextResponse.json({ ok: false, error: "Body: { company } sau { companyName, ceoName } obligatoriu." }, { status: 400 });
  }

  const { real, report } = await verifyAllSources(
    {
      companyId: c?.id ?? body?.companyId ?? "",
      companyName,
      ceoName,
      cui: c?.cui ?? body?.cui ?? null,
      companyCounty: c ? companyCounty(c) : body?.companyCounty,
      legal: body?.legal ?? null,
    },
    { checkPortal: checkPortalJust },
  );

  const quiz = typeof body?.quizScore === "number" && Number.isFinite(body.quizScore) ? Math.max(0, Math.min(100, body.quizScore)) : null;
  const human =
    quiz === null || report.aggregateScore === null ? null : { quizScore: quiz, externalScore: report.aggregateScore, sUman: computeHumanScore(quiz, report.aggregateScore) };

  let saved: { saved: boolean; mode?: string; error?: string } = { saved: false, mode: "local" };
  const sb = getSupabase();
  if (sb && c?.id) {
    try {
      const company = await ensureCompany(sb, c);
      await saveVerificationReport(sb, company, { ...report, companyId: company.id });
      saved = { saved: true };
    } catch (e) {
      saved = { saved: false, error: e instanceof Error ? e.message : "eroare Supabase" };
    }
  }

  return NextResponse.json({ ok: true, report, real, human, ...saved });
}
