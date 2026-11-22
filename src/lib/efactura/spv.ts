/**
 * RO e-Factura (SPV) — real ANAF API integration, server only.
 *
 *   OAuth 2.0 (digital certificate login):  https://logincert.anaf.ro/anaf-oauth2/v1/authorize | /token
 *   Messages (issued + received invoices):  https://api.anaf.ro/prod/FCTEL/rest/listaMesajePaginatieFactura
 *                                            (fallback: listaMesajeFactura, last 60 days)
 *   Download one invoice (ZIP: XML + sign):  https://api.anaf.ro/prod/FCTEL/rest/descarcare?id=<id>
 *
 * Requires an application registered in ANAF's developer portal:
 *   ANAF_OAUTH_CLIENT_ID, ANAF_OAUTH_CLIENT_SECRET, ANAF_OAUTH_REDIRECT_URI (…/api/spv/callback).
 * The access token is kept in an httpOnly cookie, encrypted with AES-256-GCM (key derived from the client secret).
 * Nothing is simulated: without the configuration or the certificate login, no invoice is imported.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { invoiceXmlFromZip } from "./zip.ts";
import { siteUrl } from "../site-url.ts";

export const SPV_TOKEN_COOKIE = "ak_spv_token";
export const SPV_STATE_COOKIE = "ak_spv_state";

const AUTH_URL = "https://logincert.anaf.ro/anaf-oauth2/v1/authorize";
const TOKEN_URL = "https://logincert.anaf.ro/anaf-oauth2/v1/token";
const API = "https://api.anaf.ro/prod/FCTEL/rest";

export interface SpvConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** ANAF can be slow or block cloud IPs: never let one call hang the serverless function. */
const ANAF_TIMEOUT_MS = 20_000;

/**
 * `origin` = the current request origin, used only when ANAF_OAUTH_REDIRECT_URI is not set:
 * the redirect then becomes <site>/api/spv/callback (it must still match the URL registered at ANAF).
 */
export function spvConfig(origin?: string): SpvConfig | null {
  const clientId = process.env.ANAF_OAUTH_CLIENT_ID ?? "";
  const clientSecret = process.env.ANAF_OAUTH_CLIENT_SECRET ?? "";
  const base = siteUrl(origin);
  const redirectUri = process.env.ANAF_OAUTH_REDIRECT_URI || (base ? `${base}/api/spv/callback` : "");
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

export function authorizeUrl(cfg: SpvConfig, state: string) {
  const q = new URLSearchParams({ response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.redirectUri, token_content_type: "jwt", state });
  return `${AUTH_URL}?${q}`;
}

export async function exchangeCode(cfg: SpvConfig, code: string): Promise<{ accessToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    token_content_type: "jwt",
  });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store", signal: AbortSignal.timeout(ANAF_TIMEOUT_MS) });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || `ANAF OAuth a răspuns HTTP ${r.status}.`);
  return { accessToken: j.access_token, expiresIn: Number(j.expires_in ?? 3600) };
}

// ---- Token cookie encryption ---------------------------------------------------------------

const key = (secret: string) => createHash("sha256").update(`afghankingz-spv:${secret}`).digest();

export function sealToken(cfg: SpvConfig, token: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(cfg.clientSecret), iv);
  const enc = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

export function openToken(cfg: SpvConfig, sealed: string): string | null {
  try {
    const raw = Buffer.from(sealed, "base64url");
    const d = createDecipheriv("aes-256-gcm", key(cfg.clientSecret), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---- Messages + download ---------------------------------------------------------------------

export interface SpvMessage {
  id: string;
  /** "FACTURA TRIMISA" | "FACTURA PRIMITA" | "ERORI FACTURA" | ... */
  tip: string;
  dataCreare: string;
  detalii: string;
}

interface ListResponse {
  mesaje?: { id: string; tip: string; data_creare: string; detalii: string }[];
  numar_total_pagini?: number;
  eroare?: string;
}

async function anafGet(token: string, url: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(ANAF_TIMEOUT_MS) });
  if (r.status === 401 || r.status === 403) throw new Error("Sesiunea SPV a expirat: reconectează-te cu certificatul digital.");
  return r;
}

/** Invoices issued and received by `cif` in the last `days` days (max 365 via pagination). */
export async function listInvoiceMessages(token: string, cif: string, days = 365): Promise<SpvMessage[]> {
  const digits = cif.replace(/\D/g, "");
  if (!digits) throw new Error("CUI lipsă: SPV listează facturile după CIF.");
  const end = Date.now();
  const start = end - Math.min(365, Math.max(1, days)) * 86_400_000;
  const out: SpvMessage[] = [];
  const keep = (list: ListResponse["mesaje"]) => {
    for (const m of list ?? []) if (/FACTURA (TRIMISA|PRIMITA)/i.test(m.tip)) out.push({ id: String(m.id), tip: m.tip, dataCreare: m.data_creare, detalii: m.detalii });
  };
  try {
    for (let page = 1, pages = 1; page <= pages && page <= 50; page++) {
      const r = await anafGet(token, `${API}/listaMesajePaginatieFactura?startTime=${start}&endTime=${end}&cif=${digits}&pagina=${page}`);
      const j = (await r.json()) as ListResponse;
      if (j.eroare && !j.mesaje) {
        if (/nu exista mesaje/i.test(j.eroare)) return out;
        throw new Error(j.eroare);
      }
      pages = Number(j.numar_total_pagini ?? 1);
      keep(j.mesaje);
    }
    return out;
  } catch (e) {
    if (e instanceof Error && /expirat/.test(e.message)) throw e;
    // Fallback: the simple list (last 60 days).
    const r = await anafGet(token, `${API}/listaMesajeFactura?zile=60&cif=${digits}`);
    const j = (await r.json()) as ListResponse;
    if (j.eroare && !j.mesaje) {
      if (/nu exista mesaje/i.test(j.eroare)) return [];
      throw new Error(j.eroare);
    }
    keep(j.mesaje);
    return out;
  }
}

/** Downloads one message (ZIP) and returns the invoice XML inside it. */
export async function downloadInvoiceXml(token: string, id: string): Promise<{ name: string; xml: string }[]> {
  const r = await anafGet(token, `${API}/descarcare?id=${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`Descărcarea mesajului ${id} a eșuat (HTTP ${r.status}).`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  return invoiceXmlFromZip(bytes, async (d) => new Uint8Array(inflateRawSync(d)), `spv-${id}.zip`);
}
