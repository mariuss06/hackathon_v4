import { connection, NextResponse, type NextRequest } from "next/server";
import { openToken, spvConfig, SPV_TOKEN_COOKIE } from "@/lib/efactura/spv";

/** GET /api/spv/status — is the ANAF OAuth app configured, and is this browser connected to SPV? */
export async function GET(request: NextRequest) {
  await connection();
  const cfg = spvConfig(request.nextUrl.origin);
  const sealed = request.cookies.get(SPV_TOKEN_COOKIE)?.value;
  return NextResponse.json({ configured: Boolean(cfg), connected: Boolean(cfg && sealed && openToken(cfg, sealed)) });
}

/** DELETE /api/spv/status — disconnects SPV (removes the token cookie). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SPV_TOKEN_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
