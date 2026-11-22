"use server";

import { XMLParser } from "fast-xml-parser";
import type { CourtCase, CourtHearing, LegalCheckResult } from "@/types/scoring";
import { analyzeCase, assessIdentity, partyNameExact, rescoreLegal } from "@/lib/scoringEngine";

const ENDPOINT = "http://portalquery.just.ro/Query.asmx";
const SOAP_ACTION = "portalquery.just.ro/CautareDosare";
// Common names return ~17 MB (1000 cases) and take 5+ seconds.
const TIMEOUT_MS = 15_000;
const MAX_CASES_PER_QUERY = 50;
/** portal.just.ro never returns more than this many cases per search. */
const PORTAL_RESULT_LIMIT = 1000;

export interface CheckPortalJustInput {
  companyName: string;
  ceoName: string;
  /** County of the firm's registered office, to compare with the court of each case. */
  companyCounty?: string;
}

// ---------------------------------------------------------------------------
// SOAP helpers
// ---------------------------------------------------------------------------

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

function buildEnvelope(numeParte: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CautareDosare xmlns="portalquery.just.ro">
      <numeParte>${escapeXml(numeParte)}</numeParte>
    </CautareDosare>
  </soap:Body>
</soap:Envelope>`;
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === "Dosar" || name === "DosarParte" || name === "DosarSedinta",
});

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

interface RawDosar {
  numar?: unknown;
  data?: unknown;
  institutie?: unknown;
  obiect?: unknown;
  categorieCaz?: unknown;
  categorieCazNume?: unknown;
  stadiuProcesual?: unknown;
  stadiuProcesualNume?: unknown;
  parti?: { DosarParte?: { nume?: unknown; calitateParte?: unknown }[] };
  sedinte?: {
    DosarSedinta?: { data?: unknown; solutie?: unknown; solutieSumar?: unknown; documentSedinta?: unknown }[];
  };
}

export interface ParsedPortalResponse {
  cases: CourtCase[];
  /** Cases returned by the portal where no party has exactly the searched name. */
  excluded: number;
  /** Portal hit its 1000-result limit: exact matches beyond it are not visible. */
  truncated: boolean;
}

/** What we know about the firm, to judge whether an administrator case is really theirs. */
export interface IdentityContext {
  companyName: string;
  companyCounty: string;
}

/**
 * Parses a CautareDosare SOAP response into CourtCase objects.
 * Keeps ONLY cases where a party has exactly the searched full name,
 * and rates how sure it is that the case belongs to the searched party.
 */
export async function parseCautareDosareXml(
  xml: string,
  matchedBy: CourtCase["matchedBy"],
  searchedName = "",
  identity: IdentityContext = { companyName: "", companyCounty: "" },
): Promise<ParsedPortalResponse> {
  const doc = parser.parse(xml);
  const body = doc?.Envelope?.Body;
  if (body?.Fault) throw new Error(`SOAP Fault: ${str(body.Fault.faultstring)}`);
  const dosare: RawDosar[] = body?.CautareDosareResponse?.CautareDosareResult?.Dosar ?? [];
  const nameType = matchedBy === "firma" ? "firma" : "persoana";

  const cases: CourtCase[] = [];
  let excluded = 0;
  for (const d of dosare) {
    const parti = d.parti?.DosarParte ?? [];
    const isMe = (p: { nume?: unknown }) => partyNameExact(str(p.nume), searchedName, nameType);
    const mine = parti.filter(isMe);
    if (mine.length === 0) {
      excluded++;
      continue;
    }
    if (cases.length >= MAX_CASES_PER_QUERY) continue;

    const obiect = str(d.obiect);
    const categorie = str(d.categorieCazNume || d.categorieCaz);
    const stadiu = str(d.stadiuProcesualNume || d.stadiuProcesual);
    const partyRoles = mine.map((p) => str(p.calitateParte).replace(/\s+/g, " ").trim()).filter(Boolean);
    const hearings: CourtHearing[] = (d.sedinte?.DosarSedinta ?? []).map((h) => ({
      data: str(h.data),
      solutie: str(h.solutie),
      solutieSumar: str(h.solutieSumar),
      documentSedinta: str(h.documentSedinta),
    }));
    const analysis = analyzeCase({ obiect, categorie, stadiu, partyRoles, hearings, searchedName });
    const institutie = str(d.institutie).replace(/([a-z])([A-Z])/g, "$1 $2");
    const id = assessIdentity({ matchedBy, partyNames: parti.map((p) => str(p.nume)), institutie, ...identity });
    // Searched party first so it is visible in the UI.
    const sortedParti = [...mine, ...parti.filter((p) => !isMe(p))];
    cases.push({
      numar: str(d.numar),
      institutie,
      confidence: id.confidence,
      confidenceReasons: id.reasons,
      data: str(d.data).slice(0, 10),
      obiect,
      categorie,
      stadiu,
      parti: sortedParti
        .slice(0, 6)
        .map((p) => `${str(p.nume)}${p.calitateParte ? ` (${str(p.calitateParte)})` : ""}`),
      matchedBy,
      partyRoles,
      ...analysis,
    });
  }
  return { cases, excluded, truncated: dosare.length >= PORTAL_RESULT_LIMIT };
}

async function queryPortal(numeParte: string, matchedBy: CourtCase["matchedBy"], identity: IdentityContext) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `"${SOAP_ACTION}"`,
    },
    body: buildEnvelope(numeParte),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok && !text.includes("Envelope")) {
    throw new Error(`portal.just.ro HTTP ${res.status}`);
  }
  return parseCautareDosareXml(text, matchedBy, numeParte, identity);
}

// ---------------------------------------------------------------------------
// Server Action
// ---------------------------------------------------------------------------

function buildResult(
  input: CheckPortalJustInput,
  cases: CourtCase[],
  source: LegalCheckResult["source"],
  message: string,
  excludedCount = 0,
): LegalCheckResult {
  const isFallback = source === "fallback";
  return rescoreLegal({
    query: { companyName: input.companyName, ceoName: input.ceoName, companyCounty: input.companyCounty?.trim() ?? "" },
    source,
    isFallback,
    cases,
    totalFound: cases.length,
    excludedCount,
    criticalCount: 0,
    totalDeduction: 0,
    minorCapApplied: false,
    // Unavailable portal: no score at all (the assessment leaves the source out instead of inventing one).
    legalScore: 0,
    integrityKillSwitch: false,
    message,
    checkedAt: new Date().toISOString(),
  });
}

const IDENTITY_NOTE =
  "Portalul nu publică CNP-ul: fiecare dosar al administratorului are un nivel de încredere (firma în același dosar, județul instanței). Dosarele incerte contează redus până le confirmi sau le contești.";

export async function checkPortalJust(input: CheckPortalJustInput): Promise<LegalCheckResult> {
  const companyName = input.companyName.trim();
  const ceoName = input.ceoName.trim();
  const companyCounty = input.companyCounty?.trim() ?? "";
  const clean = { ...input, companyName, ceoName };
  const identity: IdentityContext = { companyName, companyCounty };

  try {
    const queries: Promise<ParsedPortalResponse>[] = [];
    if (companyName) queries.push(queryPortal(companyName, "firma", identity));
    if (ceoName) queries.push(queryPortal(ceoName, "administrator", identity));
    const responses = await Promise.all(queries);
    const results = responses.flatMap((r) => r.cases);
    const excluded = responses.reduce((sum, r) => sum + r.excluded, 0);
    const truncated = responses.some((r) => r.truncated);

    // Deduplicate cases found by both company and administrator name.
    const unique = new Map<string, CourtCase>();
    for (const c of results) {
      const key = `${c.numar}|${c.institutie}`;
      if (!unique.has(key)) unique.set(key, c);
    }
    const cases = [...unique.values()].sort((x, y) => y.severity - x.severity || y.deduction - x.deduction);
    const parts = [cases.length === 0 ? "0 dosare pe numele exact." : `${cases.length} dosare pe numele exact.`];
    if (excluded > 0) {
      parts.push(
        `${excluded} dosare returnate de portal au fost excluse: conțin doar o parte din nume (alt prenume sau alt nume de familie).`,
      );
    }
    if (truncated) {
      parts.push("Numele este foarte comun: portalul s-a oprit la 1000 de rezultate, deci pot exista dosare nevăzute.");
    }
    if (cases.some((c) => c.matchedBy === "administrator")) parts.push(IDENTITY_NOTE);
    return buildResult(clean, cases, "portal.just.ro", parts.join(" "), excluded);
  } catch (err) {
    const reason =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
        ? `serverul nu a răspuns în ${TIMEOUT_MS / 1000} secunde`
        : err instanceof Error
          ? err.message
          : "eroare necunoscută";
    return buildResult(
      clean,
      [],
      "fallback",
      `portal.just.ro indisponibil (${reason}). Sursa nu intră în scor până la o verificare reușită — apasă „Reverifică”.`,
    );
  }
}
