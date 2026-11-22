import { connection, NextResponse, type NextRequest } from "next/server";
import { getAdminAccess, getRole } from "@/lib/auth/server";
import { getSupabase } from "@/lib/supabase/server";

/** GET /api/account/profile — the signed-in account (Bearer token) with its role, plus the demo-admin flag. */
export async function GET(request: NextRequest) {
  await connection();
  const access = await getAdminAccess(request);
  const user = access.user;
  if (!user) return NextResponse.json({ ok: false, demoAdmin: access.via === "demo" });
  const sb = getSupabase();
  let fullName = "";
  if (sb) {
    const { data } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    fullName = (data as { full_name?: string | null } | null)?.full_name ?? "";
  }
  const role = await getRole(user);
  return NextResponse.json({ ok: true, profile: { id: user.id, email: user.email, fullName, role }, demoAdmin: access.via === "demo" });
}
