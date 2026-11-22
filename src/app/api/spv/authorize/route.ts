import { randomBytes } from "node:crypto";
import { connection, NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, spvConfig, SPV_STATE_COOKIE } from "@/lib/efactura/spv";

/** GET /api/spv/authorize?returnTo=/onboarding — redirects to the ANAF certificate login (OAuth 2.0). */
export async function GET(request: NextRequest) {
  await connection();
  const cfg = spvConfig(request.nextUrl.origin);
  const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/onboarding";
  const safeReturn = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/onboarding";
  if (!cfg) return NextResponse.redirect(new URL(`${safeReturn}?spv=neconfigurat`, request.url));
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(cfg, state));
  res.cookies.set(SPV_STATE_COOKIE, `${state}|${safeReturn}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return res;
}
