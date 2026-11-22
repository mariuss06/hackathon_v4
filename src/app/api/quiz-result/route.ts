import { NextResponse, type NextRequest } from "next/server";
import { findCompanyById, getSupabase } from "@/lib/supabase/server";

/**
 * POST /api/quiz-result — saves a finished in-app quiz (step 1 financial quiz or step 3 investment form)
 * in Supabase `assessments` (quiz_source = 'platform') together with the recalculated pillar scores.
 */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => null)) as {
    companyId?: string;
    quizAnswers?: unknown;
    quizScore?: number | null;
    investment?: unknown;
    sUman?: number;
    sInvestitie?: number;
    finalScore?: number;
  } | null;
  if (!b?.companyId) return NextResponse.json({ persisted: false, error: "companyId lipsă" }, { status: 400 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ persisted: false, error: "Supabase neconfigurat" });
  const company = await findCompanyById(sb, b.companyId).catch(() => null);
  if (!company) return NextResponse.json({ persisted: false, error: "firma nu este salvată în Supabase" });
  const { error } = await sb.from("assessments").insert({
    company_id: company.id,
    quiz_answers: b.quizAnswers ?? null,
    quiz_score: b.quizScore ?? null,
    quiz_source: "platform",
    investment: b.investment ?? null,
    s_uman: b.sUman ?? null,
    s_investitie: b.sInvestitie ?? null,
    final_score: b.finalScore ?? null,
  });
  return NextResponse.json(error ? { persisted: false, error: error.message } : { persisted: true });
}
