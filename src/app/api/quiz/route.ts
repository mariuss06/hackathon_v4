import { connection, NextResponse, type NextRequest } from "next/server";
import type { ClientShareBucket, PaymentTermBucket, QuizAnswers } from "@/types/scoring";
import { computeMetrics } from "@/lib/metrics";
import { evaluateFinancialQuiz, quizTruthFromMetrics } from "@/lib/scoringEngine";
import { findCompany, getSupabase, loadDataset } from "@/lib/supabase/server";

/**
 * Bridge to an external quiz website.
 *
 *  POST /api/quiz   (webhook, called by the quiz site when the user finishes)
 *    headers: x-quiz-secret: <QUIZ_WEBHOOK_SECRET>   (only checked if the env var is set)
 *    body: { companyId: "<uuid>" | cui: "RO45127893", answers: { revenueEstimate, paymentTerm, topClientShare, mainSupplier, hasSignificantCreditNotes } }
 *    (companyId works for companies saved without a CUI)
 *    → validates the answers against e-Factura and stores them (Supabase `assessments`, quiz_source = 'external').
 *
 *  GET  /api/quiz?companyId=<uuid> (or ?cui=RO45127893) → latest external answers, imported by the onboarding page.
 */

interface StoredQuiz {
  answers: QuizAnswers;
  score: number | null;
  receivedAt: string;
}

/** Fallback store when Supabase is not configured (dev / single server). */
const memory = new Map<string, StoredQuiz>();

const TERMS: PaymentTermBucket[] = ["0-7", "15", "30", "45+"];
const SHARES: ClientShareBucket[] = ["<15", "15-30", "30-50", ">50"];

function sanitize(raw: Record<string, unknown>): QuizAnswers {
  const n = Number(raw.revenueEstimate);
  const yes = raw.hasSignificantCreditNotes;
  return {
    revenueEstimate: Number.isFinite(n) && n > 0 ? n : null,
    paymentTerm: TERMS.includes(raw.paymentTerm as PaymentTermBucket) ? (raw.paymentTerm as PaymentTermBucket) : null,
    topClientShare: SHARES.includes(raw.topClientShare as ClientShareBucket) ? (raw.topClientShare as ClientShareBucket) : null,
    mainSupplier: typeof raw.mainSupplier === "string" && raw.mainSupplier.trim() ? raw.mainSupplier.trim() : null,
    hasSignificantCreditNotes: yes === true || yes === "true" || yes === "da" ? true : yes === false || yes === "false" || yes === "nu" ? false : null,
  };
}

export async function POST(request: NextRequest) {
  const secret = process.env.QUIZ_WEBHOOK_SECRET;
  if (secret && request.headers.get("x-quiz-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "x-quiz-secret invalid" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { companyId?: string; cui?: string; answers?: Record<string, unknown> } | null;
  const ref = body?.companyId || body?.cui;
  if (!ref || !body?.answers) return NextResponse.json({ ok: false, error: "Body: { companyId | cui, answers } obligatoriu." }, { status: 400 });

  const answers = sanitize(body.answers);
  const dataset = await loadDataset(ref);
  // The quiz is validated only against the company's REAL invoices; without them the answers are stored unscored.
  const quiz = dataset.company && dataset.invoices.length ? evaluateFinancialQuiz(answers, quizTruthFromMetrics(computeMetrics(dataset.invoices, dataset.company))) : null;
  const stored: StoredQuiz = { answers, score: quiz?.total ?? null, receivedAt: new Date().toISOString() };
  memory.set(ref, stored);

  const sb = getSupabase();
  if (sb) {
    const company = await findCompany(sb, ref).catch(() => null);
    if (company) {
      await sb.from("assessments").insert({ company_id: company.id, quiz_answers: answers, quiz_score: quiz?.total ?? null, quiz_source: "external" });
    }
  }
  return NextResponse.json({ ok: true, score: quiz?.total ?? null, level: quiz?.levelLabel ?? "nevalidat: firma nu are încă facturi e-Factura încărcate" });
}

export async function GET(request: NextRequest) {
  await connection();
  const cui = request.nextUrl.searchParams.get("companyId") ?? request.nextUrl.searchParams.get("cui");
  if (!cui) return NextResponse.json({ found: false, error: "companyId sau cui lipsă" }, { status: 400 });

  const sb = getSupabase();
  if (sb) {
    const company = await findCompany(sb, cui).catch(() => null);
    if (company) {
      const { data } = await sb
        .from("assessments")
        .select("quiz_answers, quiz_score, created_at")
        .eq("company_id", company.id)
        .eq("quiz_source", "external")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return NextResponse.json({ found: true, answers: data.quiz_answers, score: data.quiz_score, receivedAt: data.created_at });
    }
  }
  const m = memory.get(cui);
  return NextResponse.json(m ? { found: true, ...m } : { found: false });
}
