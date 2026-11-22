import { NextResponse, type NextRequest } from "next/server";
import { getSupabase, saveB2bLead, type B2bLeadInput } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Validates the "Solicită Demo B2B" form. Returns the cleaned lead or the first error. */
function validateLead(raw: Partial<Record<keyof B2bLeadInput, unknown>> | null): { lead?: B2bLeadInput; error?: string } {
  const lead: B2bLeadInput = {
    fullName: clip(raw?.fullName, 120),
    organization: clip(raw?.organization, 160),
    email: clip(raw?.email, 160).toLowerCase(),
    phone: clip(raw?.phone, 40),
    message: clip(raw?.message, 2000),
  };
  if (!lead.fullName) return { error: "Numele este obligatoriu." };
  if (!lead.organization) return { error: "Instituția / banca este obligatorie." };
  if (!EMAIL_RE.test(lead.email)) return { error: "Adresa de email nu este validă." };
  if (lead.phone && !/^[+()\d\s.-]{6,40}$/.test(lead.phone)) return { error: "Numărul de telefon nu este valid." };
  return { lead };
}

/** POST /api/b2b-leads — stores a B2B demo request in public.b2b_leads. Body: { fullName, organization, email, phone?, message?, consent: true, website: "" (honeypot) }. */
export async function POST(request: NextRequest) {
  const raw = (await request.json().catch(() => null)) as (Partial<Record<keyof B2bLeadInput, unknown>> & { website?: unknown; consent?: unknown }) | null;
  // Honeypot: a hidden field only bots fill in. Answer as if saved, store nothing.
  if (typeof raw?.website === "string" && raw.website.trim()) return NextResponse.json({ ok: true, message: "Mulțumim!" });
  if (raw?.consent !== true) return NextResponse.json({ ok: false, error: "Bifează acordul pentru prelucrarea datelor (GDPR)." }, { status: 400 });
  const { lead, error } = validateLead(raw);
  if (!lead) return NextResponse.json({ ok: false, error }, { status: 400 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ ok: false, mode: "local", error: "Supabase neconfigurat — cererea nu a putut fi salvată." }, { status: 503 });
  try {
    const row = await saveB2bLead(sb, lead);
    return NextResponse.json({ ok: true, id: row.id, message: "Mulțumim! Echipa CrediFit vă contactează în maximum 2 zile lucrătoare." });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "eroare Supabase" }, { status: 500 });
  }
}
