import { NextResponse, type NextRequest } from "next/server";
import { downloadInvoiceXml, listInvoiceMessages, openToken, spvConfig, SPV_TOKEN_COOKIE } from "@/lib/efactura/spv";

/** Lists and downloads many invoices from ANAF SPV: allow up to 60 s on serverless hosts. */
export const maxDuration = 60;

/** Download cap per sync (ANAF rate limits the API; the next sync continues with the rest). */
const MAX_DOWNLOADS = 150;

/**
 * POST /api/spv/sync — lists the company's issued + received invoices in SPV and downloads their XML.
 * Body: { cui, days? }. Returns { files: [{ name, xml }] }: the browser parses them (UBL 2.1) on the
 * active company and the existing upload pipeline saves them in e_invoices and recalculates the score.
 */
export async function POST(request: NextRequest) {
  const cfg = spvConfig(request.nextUrl.origin);
  if (!cfg) return NextResponse.json({ ok: false, step: "auth", error: "Integrarea SPV nu este configurată (ANAF_OAUTH_CLIENT_ID / SECRET / REDIRECT_URI)." }, { status: 503 });
  const sealed = request.cookies.get(SPV_TOKEN_COOKIE)?.value;
  const token = sealed ? openToken(cfg, sealed) : null;
  if (!token) return NextResponse.json({ ok: false, step: "auth", error: "Conectează-te întâi la SPV cu certificatul digital." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { cui?: unknown; days?: unknown } | null;
  const cui = typeof body?.cui === "string" ? body.cui : "";
  const days = typeof body?.days === "number" ? body.days : 365;
  try {
    const messages = await listInvoiceMessages(token, cui, days);
    const files: { name: string; xml: string }[] = [];
    const failed: string[] = [];
    for (const m of messages.slice(0, MAX_DOWNLOADS)) {
      try {
        files.push(...(await downloadInvoiceXml(token, m.id)));
      } catch {
        failed.push(m.id);
      }
    }
    return NextResponse.json({
      ok: true,
      found: messages.length,
      issued: messages.filter((m) => /TRIMISA/i.test(m.tip)).length,
      received: messages.filter((m) => /PRIMITA/i.test(m.tip)).length,
      downloaded: files.length,
      truncated: messages.length > MAX_DOWNLOADS,
      failed,
      files,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "SPV indisponibil.";
    return NextResponse.json({ ok: false, step: /expirat/.test(message) ? "auth" : "fetch", error: message }, { status: 502 });
  }
}
