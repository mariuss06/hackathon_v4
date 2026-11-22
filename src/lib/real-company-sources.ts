/**
 * Real company data from 5 official, public sources — never invented.
 *
 *   1. anaf_general  ANAF public VAT web service (v9): official name, Reg. Com., address, CAEN, VAT, inactive, e-Factura
 *   2. anaf_bilant   ANAF / MF financial statements (bilanț) for the latest filed years
 *   3. portal_just   portal.just.ro court cases (runs in app/actions/checkPortalJust.ts, passed in as a dependency)
 *   4. vies_eu       European Commission VIES: intra-EU VAT validity, name, address
 *   5. onrc_bpi      legal state from the ONRC data republished by ANAF (registered / deregistered / inactive)
 *                    + insolvency proceedings found on portal.just.ro for the firm (BPI has no free public API)
 *
 * Every source returns a RealSourceResult with an honest status:
 *   verified      the source answered and the firm was found
 *   not_found     the source answered, but has nothing for this CUI (e.g. no balance sheet filed)
 *   requires_cui  the source can only be queried by CUI and none was entered
 *   unavailable   timeout / network / unexpected answer — nothing is assumed
 *
 * ANAF v8 (/PlatitorTvaRest/api/v8/ws/tva) now answers HTTP 404: the current endpoint is v9.
 * Relative imports only (with .ts) so `node --test` can run it like the other lib modules.
 */
import type { LegalCheckResult } from "../types/scoring";
import { COUNTIES, normalizeRo } from "./scoringEngine.ts";

export type RealSourceId = "anaf_general" | "anaf_bilant" | "portal_just" | "vies_eu" | "onrc_bpi";
export type RealSourceStatus = "verified" | "not_found" | "requires_cui" | "unavailable";

export interface RealSourceResult {
  sourceId: RealSourceId;
  name: string;
  /** Who publishes it and where. */
  institution: string;
  status: RealSourceStatus;
  checkedAt: string;
  rawSummary: string;
  data: Record<string, unknown> | null;
}

export interface AnafGeneralData {
  cui: string;
  denumire: string;
  nrRegCom: string;
  adresa: string;
  codCaen: string;
  telefon: string;
  stareInregistrare: string;
  dataInregistrare: string;
  formaJuridica: string;
  scpTva: boolean;
  tvaLaIncasare: boolean;
  splitTva: boolean;
  eFactura: boolean;
  inactiv: boolean;
  dataInactivare: string;
  dataReactivare: string;
  dataRadiere: string;
  /** County of the registered office, mapped to the app's county list ("" if not recognised). */
  judet: string;
  localitate: string;
}

/** One filed balance sheet (RON; employees = average headcount). */
export interface BilantYear {
  an: number;
  denumire: string;
  caen: string;
  denCaen: string;
  cifraAfaceri: number;
  venituriTotale: number;
  cheltuieliTotale: number;
  profitBrut: number;
  pierdereBruta: number;
  profitNet: number;
  pierdereNeta: number;
  datorii: number;
  capitaluriProprii: number;
  activeImobilizate: number;
  activeCirculante: number;
  stocuri: number;
  creante: number;
  casaBanci: number;
  salariati: number;
}

export interface ViesData {
  isValid: boolean;
  name: string;
  address: string;
  requestDate: string;
}

export type LegalState = "În funcțiune" | "Radiată" | "Dizolvare / lichidare" | "Inactivă fiscal" | "Suspendată";

export interface OnrcBpiData {
  stareJuridica: LegalState;
  stareInregistrare: string;
  nrRegCom: string;
  dataInregistrare: string;
  vechimeLuni: number | null;
  dataRadiere: string;
  dataInactivare: string;
  /** Insolvency / bankruptcy cases of the firm found on portal.just.ro (case number · court · stage). */
  insolventa: string[];
  /** True when portal.just.ro was actually reachable (otherwise insolvency is unknown, not "none"). */
  insolventaVerificata: boolean;
}

export interface CompanyRealData {
  cui: string;
  sources: RealSourceResult[];
  anaf: AnafGeneralData | null;
  /** Newest year first. */
  bilant: BilantYear[];
  vies: ViesData | null;
  onrc: OnrcBpiData | null;
  checkedAt: string;
}

export interface RealSourceDeps {
  fetch?: typeof fetch;
  /** ISO date-time used as "now" (tests). */
  now?: string;
  timeoutMs?: number;
}

export const REAL_SOURCE_META: Record<RealSourceId, { name: string; institution: string }> = {
  anaf_general: { name: "ANAF — date oficiale, TVA, CAEN, e-Factura", institution: "webservicesp.anaf.ro · ANAF" },
  anaf_bilant: { name: "Bilanțuri depuse (ANAF / Ministerul Finanțelor)", institution: "webservicesp.anaf.ro/bilant · MF" },
  portal_just: { name: "Portalul Instanțelor de Judecată", institution: "portal.just.ro · Ministerul Justiției" },
  vies_eu: { name: "VIES — cod TVA intracomunitar", institution: "ec.europa.eu · Comisia Europeană" },
  onrc_bpi: { name: "Stare juridică ONRC & insolvență", institution: "date ONRC prin ANAF · portal.just.ro" },
};

export const REAL_SOURCE_ORDER: RealSourceId[] = ["anaf_general", "anaf_bilant", "portal_just", "vies_eu", "onrc_bpi"];

export const ANAF_TVA_ENDPOINT = "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva";
export const ANAF_BILANT_ENDPOINT = "https://webservicesp.anaf.ro/bilant";
export const VIES_ENDPOINT = "https://ec.europa.eu/taxation_customs/vies/rest-api/ms/RO/vat";
export const REAL_SOURCE_TIMEOUT_MS = 6_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "RO 45127893" → "45127893"; "" when there are no digits (or more than a CUI can have). */
export function cleanCui(raw: string | null | undefined) {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 2 && digits.length <= 10 ? digits : "";
}

const source = (sourceId: RealSourceId, status: RealSourceStatus, rawSummary: string, data: Record<string, unknown> | null, checkedAt: string): RealSourceResult => ({
  sourceId,
  ...REAL_SOURCE_META[sourceId],
  status,
  checkedAt,
  rawSummary,
  data,
});

const reasonOf = (e: unknown) => {
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "timeout";
  return e instanceof Error ? e.message : String(e);
};

async function fetchWithTimeout(url: string, init: RequestInit, deps: RealSourceDeps) {
  const doFetch = deps.fetch ?? fetch;
  return doFetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(deps.timeoutMs ?? REAL_SOURCE_TIMEOUT_MS) });
}

const text = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** Whole months between two ISO dates (null if either is invalid). */
export function monthsBetween(fromIso: string, toIso: string) {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  if (!fromIso || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0));
}

const compact = (s: string) => normalizeRo(s).replace(/[^a-z]/g, "");

/** "MUNICIPIUL BUCUREŞTI" → "București", "JUDEŢUL CLUJ" / "CLUJ" → "Cluj"; "" when unknown. */
export function countyFromAnaf(judet: string) {
  const c = compact(judet).replace(/^(municipiul|judetul|jud)/, "");
  if (!c) return "";
  return COUNTIES.find((x) => compact(x.name) === c)?.name ?? "";
}

// ---------------------------------------------------------------------------
// 1. ANAF general record (v9)
// ---------------------------------------------------------------------------

interface AnafRaw {
  date_generale?: Record<string, unknown>;
  inregistrare_scop_Tva?: { scpTVA?: boolean };
  inregistrare_RTVAI?: { statusTvaIncasare?: boolean };
  stare_inactiv?: { statusInactivi?: boolean; dataInactivare?: string; dataReactivare?: string; dataRadiere?: string };
  inregistrare_SplitTVA?: { statusSplitTVA?: boolean };
  adresa_sediu_social?: Record<string, unknown>;
}

export function parseAnafRecord(r: AnafRaw): AnafGeneralData {
  const g = r.date_generale ?? {};
  const sediu = r.adresa_sediu_social ?? {};
  return {
    cui: text(g.cui),
    denumire: text(g.denumire),
    nrRegCom: text(g.nrRegCom),
    adresa: text(g.adresa),
    codCaen: text(g.cod_CAEN),
    telefon: text(g.telefon),
    stareInregistrare: text(g.stare_inregistrare),
    dataInregistrare: text(g.data_inregistrare),
    formaJuridica: text(g.forma_juridica),
    scpTva: Boolean(r.inregistrare_scop_Tva?.scpTVA),
    tvaLaIncasare: Boolean(r.inregistrare_RTVAI?.statusTvaIncasare),
    splitTva: Boolean(r.inregistrare_SplitTVA?.statusSplitTVA),
    eFactura: Boolean(g.statusRO_e_Factura),
    inactiv: Boolean(r.stare_inactiv?.statusInactivi),
    dataInactivare: text(r.stare_inactiv?.dataInactivare),
    dataReactivare: text(r.stare_inactiv?.dataReactivare),
    dataRadiere: text(r.stare_inactiv?.dataRadiere),
    judet: countyFromAnaf(text(sediu.sdenumire_Judet)),
    localitate: text(sediu.sdenumire_Localitate),
  };
}

export async function fetchAnafGeneral(cui: string, deps: RealSourceDeps = {}): Promise<{ result: RealSourceResult; data: AnafGeneralData | null }> {
  const checkedAt = deps.now ?? new Date().toISOString();
  if (!cui) return { result: source("anaf_general", "requires_cui", "Completează CUI-ul: serviciul ANAF caută doar după CUI.", null, checkedAt), data: null };
  try {
    const res = await fetchWithTimeout(
      ANAF_TVA_ENDPOINT,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([{ cui: Number(cui), data: checkedAt.slice(0, 10) }]) },
      deps,
    );
    // An unknown CUI comes back as HTTP 404 with a JSON body { found: [], notFound: [cui] }.
    const json = (await res.json().catch(() => null)) as { found?: AnafRaw[]; notFound?: unknown[] } | null;
    if (!json || (!Array.isArray(json.found) && !Array.isArray(json.notFound))) {
      return { result: source("anaf_general", "unavailable", `ANAF a răspuns neașteptat (HTTP ${res.status}).`, null, checkedAt), data: null };
    }
    const raw = json.found?.[0];
    if (!raw) return { result: source("anaf_general", "not_found", `CUI ${cui} nu există în baza ANAF.`, null, checkedAt), data: null };
    const data = parseAnafRecord(raw);
    const summary = [
      data.denumire,
      data.nrRegCom,
      data.codCaen && `CAEN ${data.codCaen}`,
      data.inactiv ? "INACTIV fiscal" : "activ fiscal",
      data.scpTva ? "plătitor TVA" : "neplătitor TVA",
      data.eFactura ? "în Registrul RO e-Factura" : "nu figurează în Registrul RO e-Factura",
    ]
      .filter(Boolean)
      .join(" · ");
    return { result: source("anaf_general", "verified", summary, { ...data }, checkedAt), data };
  } catch (e) {
    return { result: source("anaf_general", "unavailable", `ANAF indisponibil (${reasonOf(e)}).`, null, checkedAt), data: null };
  }
}

// ---------------------------------------------------------------------------
// 2. Balance sheets (bilanț)
// ---------------------------------------------------------------------------

/** Indicator labels as published (normalized); the codes I1..I20 change order between years, the labels do not. */
const BILANT_FIELDS: [keyof BilantYear, RegExp][] = [
  ["activeImobilizate", /^active imobilizate/],
  ["activeCirculante", /^active circulante/],
  ["stocuri", /^stocuri/],
  ["creante", /^creante/],
  ["casaBanci", /^casa si conturi/],
  ["datorii", /^datorii/],
  ["capitaluriProprii", /^capitaluri/],
  ["cifraAfaceri", /^cifra de afaceri/],
  ["venituriTotale", /^venituri totale/],
  ["cheltuieliTotale", /^cheltuieli totale/],
  ["profitBrut", /^profit brut/],
  ["pierdereBruta", /^pierdere bruta/],
  ["profitNet", /^profit net/],
  ["pierdereNeta", /^pierdere neta/],
  ["salariati", /^numar mediu de salariati/],
];

interface BilantRaw {
  an?: number;
  deni?: string;
  caen?: number | string;
  den_caen?: string;
  i?: { indicator?: string; val_indicator?: number; val_den_indicator?: string }[];
}

/** null when the year has no filed balance sheet (ANAF answers with an empty indicator list). */
export function parseBilant(raw: BilantRaw, year: number): BilantYear | null {
  if (!Array.isArray(raw.i) || raw.i.length === 0) return null;
  const out: BilantYear = {
    an: Number(raw.an) || year,
    denumire: text(raw.deni),
    caen: text(raw.caen),
    denCaen: text(raw.den_caen),
    cifraAfaceri: 0,
    venituriTotale: 0,
    cheltuieliTotale: 0,
    profitBrut: 0,
    pierdereBruta: 0,
    profitNet: 0,
    pierdereNeta: 0,
    datorii: 0,
    capitaluriProprii: 0,
    activeImobilizate: 0,
    activeCirculante: 0,
    stocuri: 0,
    creante: 0,
    casaBanci: 0,
    salariati: 0,
  };
  for (const ind of raw.i) {
    const label = normalizeRo(text(ind.val_den_indicator));
    const hit = BILANT_FIELDS.find(([, re]) => re.test(label));
    if (hit) (out[hit[0]] as number) = num(ind.val_indicator);
  }
  return out;
}

/** Net result of a year: profit (positive) or loss (negative). */
export const netResult = (b: BilantYear) => (b.profitNet > 0 ? b.profitNet : -b.pierdereNeta);
export const grossResult = (b: BilantYear) => (b.profitBrut > 0 ? b.profitBrut : -b.pierdereBruta);

/** The latest 2 filed years, trying the 3 most recent fiscal years (the current year is never filed yet). */
export async function fetchBilant(cui: string, deps: RealSourceDeps = {}): Promise<{ result: RealSourceResult; years: BilantYear[] }> {
  const checkedAt = deps.now ?? new Date().toISOString();
  if (!cui) return { result: source("anaf_bilant", "requires_cui", "Completează CUI-ul: bilanțurile se caută după CUI.", null, checkedAt), years: [] };
  const current = new Date(checkedAt).getUTCFullYear();
  const candidates = [current - 1, current - 2, current - 3];
  const settled = await Promise.allSettled(
    candidates.map(async (an) => {
      const res = await fetchWithTimeout(`${ANAF_BILANT_ENDPOINT}?an=${an}&cui=${cui}`, { method: "GET" }, deps);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseBilant((await res.json()) as BilantRaw, an);
    }),
  );
  const years = settled.flatMap((s) => (s.status === "fulfilled" && s.value ? [s.value] : [])).sort((a, b) => b.an - a.an).slice(0, 2);
  if (years.length === 0) {
    const allFailed = settled.every((s) => s.status === "rejected");
    return allFailed
      ? { result: source("anaf_bilant", "unavailable", `Serviciul de bilanțuri nu a răspuns (${reasonOf((settled[0] as PromiseRejectedResult).reason)}).`, null, checkedAt), years }
      : { result: source("anaf_bilant", "not_found", `Niciun bilanț publicat pentru ${candidates.join(", ")} (firmă nouă sau bilanț nedepus).`, null, checkedAt), years };
  }
  const y = years[0];
  const summary = `Bilanț ${y.an}: cifră de afaceri ${fmt(y.cifraAfaceri)}, rezultat net ${fmt(netResult(y))}, capitaluri proprii ${fmt(y.capitaluriProprii)}, datorii ${fmt(y.datorii)}, ${y.salariati} salariați.`;
  return { result: source("anaf_bilant", "verified", summary, { years }, checkedAt), years };
}

const fmt = (n: number) => `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(n)} RON`;

// ---------------------------------------------------------------------------
// 4. VIES
// ---------------------------------------------------------------------------

export async function fetchVies(cui: string, deps: RealSourceDeps = {}): Promise<{ result: RealSourceResult; data: ViesData | null }> {
  const checkedAt = deps.now ?? new Date().toISOString();
  if (!cui) return { result: source("vies_eu", "requires_cui", "Completează CUI-ul pentru validarea VIES.", null, checkedAt), data: null };
  try {
    const res = await fetchWithTimeout(`${VIES_ENDPOINT}/${cui}`, { method: "GET", headers: { Accept: "application/json" } }, deps);
    const json = (await res.json().catch(() => null)) as { isValid?: boolean; name?: string; address?: string; requestDate?: string; userError?: string } | null;
    if (!res.ok || !json || typeof json.isValid !== "boolean") {
      return { result: source("vies_eu", "unavailable", `VIES nu a răspuns (${json?.userError ?? `HTTP ${res.status}`}).`, null, checkedAt), data: null };
    }
    const data: ViesData = {
      isValid: json.isValid,
      name: text(json.name).replace(/^-+$/, ""),
      address: text(json.address).replace(/\s+/g, " ").replace(/^-+$/, ""),
      requestDate: text(json.requestDate),
    };
    return {
      result: data.isValid
        ? source("vies_eu", "verified", `Cod TVA RO${cui} valid în VIES${data.name ? ` · ${data.name}` : ""}.`, { ...data }, checkedAt)
        : source("vies_eu", "not_found", `RO${cui} nu este înregistrat în VIES (normal pentru firmele fără operațiuni intracomunitare).`, { ...data }, checkedAt),
      data,
    };
  } catch (e) {
    return { result: source("vies_eu", "unavailable", `VIES indisponibil (${reasonOf(e)}).`, null, checkedAt), data: null };
  }
}

// ---------------------------------------------------------------------------
// 3. portal.just.ro as a source (the search itself runs in the server action)
// ---------------------------------------------------------------------------

export function portalSource(legal: LegalCheckResult | null, checkedAt: string): RealSourceResult {
  if (!legal) return source("portal_just", "unavailable", "Verificarea portal.just.ro nu a rulat încă.", null, checkedAt);
  if (legal.isFallback) return source("portal_just", "unavailable", legal.message, null, legal.checkedAt || checkedAt);
  const firm = legal.cases.filter((c) => c.matchedBy === "firma").length;
  const ceo = legal.cases.length - firm;
  return source(
    "portal_just",
    legal.cases.length ? "verified" : "not_found",
    legal.cases.length ? `${legal.cases.length} dosare pe numele exact (${firm} firmă, ${ceo} administrator) · scor legal ${legal.legalScore}/100.` : "0 dosare pe numele exact al firmei și al administratorului.",
    {
      total: legal.cases.length,
      firm,
      administrator: ceo,
      legalScore: legal.legalScore,
      cases: legal.cases.slice(0, 20).map((c) => ({ numar: c.numar, institutie: c.institutie, obiect: c.obiect, stadiu: c.stadiu, calitate: c.partyRoles.join(", "), matchedBy: c.matchedBy })),
    },
    legal.checkedAt || checkedAt,
  );
}

// ---------------------------------------------------------------------------
// 5. ONRC legal state + insolvency (derived from 1 and 3, no extra request)
// ---------------------------------------------------------------------------

const DEREGISTERED_RE = /radiere|radiat/i;
const DISSOLVED_RE = /dizolv|lichidare|desfiintare|faliment/i;
const SUSPENDED_RE = /suspend|intrerup|întrerup/i;

export function onrcBpiFrom(anaf: AnafGeneralData | null, legal: LegalCheckResult | null, cui: string, checkedAt: string): { result: RealSourceResult; data: OnrcBpiData | null } {
  const portalOk = Boolean(legal && !legal.isFallback);
  const insolventa = portalOk
    ? // Only the firm's OWN insolvency: the legal analysis rates it critical (level 4). Cases where the firm is a
      // creditor or a mere "intimat" in another company's insolvency are not a signal about the firm.
      legal!.cases.filter((c) => c.matchedBy === "firma" && c.kind === "insolventa" && c.severity === 4 && c.userVerdict !== "contestat").map((c) => `${c.numar} · ${c.institutie} · ${c.stadiu || c.outcomeLabel}`)
    : [];
  if (!cui) return { result: source("onrc_bpi", "requires_cui", "Completează CUI-ul pentru starea juridică din registrul ONRC (prin ANAF).", null, checkedAt), data: null };
  if (!anaf) return { result: source("onrc_bpi", "unavailable", "Starea juridică vine din registrul ANAF, care nu a returnat firma.", null, checkedAt), data: null };

  const stare = anaf.stareInregistrare;
  const stareJuridica: LegalState = anaf.dataRadiere || DEREGISTERED_RE.test(stare)
    ? "Radiată"
    : DISSOLVED_RE.test(stare)
      ? "Dizolvare / lichidare"
      : SUSPENDED_RE.test(stare)
        ? "Suspendată"
        : anaf.inactiv
          ? "Inactivă fiscal"
          : "În funcțiune";
  const data: OnrcBpiData = {
    stareJuridica,
    stareInregistrare: stare,
    nrRegCom: anaf.nrRegCom,
    dataInregistrare: anaf.dataInregistrare,
    vechimeLuni: monthsBetween(anaf.dataInregistrare, checkedAt),
    dataRadiere: anaf.dataRadiere,
    dataInactivare: anaf.dataInactivare,
    insolventa,
    insolventaVerificata: portalOk,
  };
  const age = data.vechimeLuni === null ? "vechime necunoscută" : data.vechimeLuni >= 24 ? `${Math.floor(data.vechimeLuni / 12)} ani` : `${data.vechimeLuni} luni`;
  const insolvency = !portalOk ? "insolvență neverificată (portal.just.ro indisponibil)" : insolventa.length ? `${insolventa.length} dosar(e) de insolvență` : "fără dosare de insolvență";
  return { result: source("onrc_bpi", "verified", `${stareJuridica} · ${anaf.nrRegCom || "—"} · ${age} · ${insolvency}.`, { ...data }, checkedAt), data };
}

// ---------------------------------------------------------------------------
// All sources
// ---------------------------------------------------------------------------

export interface RealDataInput {
  cui?: string | null;
  companyName?: string;
  ceoName?: string;
  companyCounty?: string;
}

/**
 * Queries ANAF, the balance sheets and VIES in parallel (Promise.allSettled). portal.just.ro runs when
 * `checkPortal` is given (the API route passes the server action); otherwise `legal` (already in the
 * browser, with the user's confirmations) is used, or the source is reported as not run yet.
 */
export async function getCompanyRealData(
  input: RealDataInput,
  deps: RealSourceDeps & {
    checkPortal?: (q: { companyName: string; ceoName: string; companyCounty?: string }) => Promise<LegalCheckResult>;
    legal?: LegalCheckResult | null;
  } = {},
): Promise<CompanyRealData & { legal: LegalCheckResult | null }> {
  const checkedAt = deps.now ?? new Date().toISOString();
  const cui = cleanCui(input.cui);
  const [anafS, bilantS, viesS] = await Promise.allSettled([fetchAnafGeneral(cui, { ...deps, now: checkedAt }), fetchBilant(cui, { ...deps, now: checkedAt }), fetchVies(cui, { ...deps, now: checkedAt })]);
  const anaf = anafS.status === "fulfilled" ? anafS.value : { result: source("anaf_general", "unavailable", `ANAF: ${reasonOf(anafS.reason)}`, null, checkedAt), data: null };
  const bilant = bilantS.status === "fulfilled" ? bilantS.value : { result: source("anaf_bilant", "unavailable", `Bilanț: ${reasonOf(bilantS.reason)}`, null, checkedAt), years: [] };
  const vies = viesS.status === "fulfilled" ? viesS.value : { result: source("vies_eu", "unavailable", `VIES: ${reasonOf(viesS.reason)}`, null, checkedAt), data: null };

  // portal.just.ro searches the OFFICIAL name when ANAF knows it.
  let legal = deps.legal ?? null;
  const companyName = (anaf.data?.denumire || input.companyName || "").trim();
  if (deps.checkPortal && companyName && input.ceoName?.trim()) {
    try {
      legal = await deps.checkPortal({ companyName, ceoName: input.ceoName.trim(), companyCounty: anaf.data?.judet || input.companyCounty });
    } catch {
      legal = null;
    }
  }
  const onrc = onrcBpiFrom(anaf.data, legal, cui, checkedAt);
  return {
    cui,
    sources: [anaf.result, bilant.result, portalSource(legal, checkedAt), vies.result, onrc.result],
    anaf: anaf.data,
    bilant: bilant.years,
    vies: vies.data,
    onrc: onrc.data,
    legal,
    checkedAt,
  };
}

/** Re-derives the two sources that depend on portal.just.ro after a new legal result (no new request). */
export function withLegal(real: CompanyRealData, legal: LegalCheckResult | null): CompanyRealData {
  const onrc = onrcBpiFrom(real.anaf, legal, real.cui, real.checkedAt);
  const sources = real.sources.map((s) => (s.sourceId === "portal_just" ? portalSource(legal, real.checkedAt) : s.sourceId === "onrc_bpi" ? onrc.result : s));
  return { ...real, sources, onrc: onrc.data };
}

/** Placeholder before the first query (or without a CUI): every CUI-based source says why it is not verified. */
export function emptyRealData(cui: string | null | undefined, checkedAt = new Date().toISOString()): CompanyRealData {
  const digits = cleanCui(cui);
  const status: RealSourceStatus = digits ? "unavailable" : "requires_cui";
  const why = digits ? "Încă neinterogat." : "Completează CUI-ul în Pasul 1 pentru această sursă.";
  return {
    cui: digits,
    sources: REAL_SOURCE_ORDER.map((id) => (id === "portal_just" ? portalSource(null, checkedAt) : source(id, status, why, null, checkedAt))),
    anaf: null,
    bilant: [],
    vies: null,
    onrc: null,
    checkedAt,
  };
}
