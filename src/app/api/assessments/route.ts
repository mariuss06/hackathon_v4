import { NextResponse, type NextRequest } from "next/server";
import type { Company, InvestmentInput, Invoice, LegalCheckResult, QuizAnswers } from "@/types/scoring";
import { computeAssessment } from "@/lib/assessment";
import { ensureCompany, getSupabase, loadInvoices } from "@/lib/supabase/server";

interface Body {
  company: Company;
  quiz: QuizAnswers;
  investment: InvestmentInput;
  legal: LegalCheckResult | null;
  /** Invoices uploaded in the browser for this company (used when they are not persisted yet). */
  uploads?: Invoice[];
}

/**
 * POST /api/assessments — recompute the score SERVER-SIDE from the stored e-Factura data
 * of the active company only (never trusting a client-side score) and save a snapshot.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.company?.id) return NextResponse.json({ saved: false, error: "Body invalid: company lipsește." }, { status: 400 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ saved: false, mode: "local", message: "Supabase neconfigurat — evaluarea nu a fost salvată." });

  try {
    const company = await ensureCompany(sb, body.company);
    const stored = await loadInvoices(sb, company.id);
    const known = new Set(stored.map((i) => i.id));
    const invoices = [...stored, ...(body.uploads ?? []).filter((u) => !known.has(u.id))];
    const a = computeAssessment({
      // Form fields (CAEN / sector) may be newer than the stored row.
      company: { ...company, caenCode: body.company.caenCode || company.caenCode, sector: body.company.sector ?? company.sector },
      invoices,
      quiz: body.quiz,
      investment: body.investment,
      legal: body.legal,
    });
    const { data, error } = await sb
      .from("assessments")
      .insert({
        company_id: company.id,
        quiz_answers: body.quiz,
        quiz_score: a.quiz.total,
        quiz_source: "platform",
        investment: body.investment,
        legal_result: body.legal,
        legal_score: a.legalScore,
        sector: a.benchmark.sector.caenCode,
        s_business: a.business.score,
        s_uman: a.final.pillars.human.score,
        s_investitie: a.final.pillars.investment.score,
        final_score: a.final.finalScore,
        status: a.final.status,
        kill_switch: a.final.quizKillSwitch,
        metrics: a.metrics,
        action_plan: a.plan,
        bank_recommendations: { top: a.banks.top, alternatives: a.banks.alternatives, creditReady: a.banks.creditReady },
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ saved: true, id: data.id, createdAt: data.created_at, finalScore: a.final.finalScore });
  } catch (e) {
    return NextResponse.json({ saved: false, error: e instanceof Error ? e.message : "eroare Supabase" }, { status: 500 });
  }
}
