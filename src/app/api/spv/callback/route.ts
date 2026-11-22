import { connection, NextResponse, type NextRequest } from "next/server";
import { exchangeCode, sealToken, spvConfig, SPV_STATE_COOKIE, SPV_TOKEN_COOKIE } from "@/lib/efactura/spv";

/** GET /api/spv/callback?code=..&state=.. — ANAF redirects here after the certificate login. */
export async function GET(request: NextRequest) {
  await connection();
  const cfg = spvConfig(request.nextUrl.origin);
  const [state, returnTo = "/onboarding"] = (request.cookies.get(SPV_STATE_COOKIE)?.value ?? "").split("|");
  const back = (status: string) => {
    const res = NextResponse.redirect(new URL(`${returnTo}?spv=${status}`, request.url));
    res.cookies.set(SPV_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };
  if (!cfg) return back("neconfigurat");
  const code = request.nextUrl.searchParams.get("code") ?? "";
  if (!code || !state || request.nextUrl.searchParams.get("state") !== state) return back("eroare");
  try {
    const { accessToken, expiresIn } = await exchangeCode(cfg, code);
    const res = back("conectat");
    res.cookies.set(SPV_TOKEN_COOKIE, sealToken(cfg, accessToken), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.max(300, Math.min(expiresIn, 90 * 86_400)),
    });
    return res;
  } catch {
    return back("eroare");
  }
}
