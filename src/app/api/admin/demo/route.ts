import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_DEMO_COOKIE, checkDemoCode, demoAdminEnabled, demoAdminToken } from "@/lib/auth/server";

/**
 * POST /api/admin/demo — hackathon demo admin. Body: { code }. When it matches ADMIN_DEMO_CODE an httpOnly
 * cookie (HMAC of the code, 8 hours) opens /admin without an account. DELETE ends the demo session.
 */
export async function POST(request: NextRequest) {
  if (!demoAdminEnabled()) return NextResponse.json({ ok: false, error: "Modul demo admin este dezactivat (setează ADMIN_DEMO_CODE în .env.local)." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!checkDemoCode(code)) return NextResponse.json({ ok: false, error: "Cod de acces greșit." }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_DEMO_COOKIE, demoAdminToken(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_DEMO_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
