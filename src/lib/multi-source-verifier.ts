/**
 * ScorVerificariExterne (0-100) from the 5 REAL official sources (lib/real-company-sources.ts).
 *
 *   ScorVerificariExterne = Σ weight · score / Σ weight      over the sources that actually answered
 *   S_Uman                = 0.50 · ScorQuiz + 0.50 · ScorVerificariExterne
 *
 *   portal_just 30% · anaf_general 25% · onrc_bpi 20% · anaf_bilant 15% · vies_eu 10%
 *
 * Zero invented data: a source that did not answer, needs a CUI, or has nothing to say gets
 * score = null and is LEFT OUT of the weighted mean (its weight is redistributed), instead of
 * receiving a simulated or "neutral" value. When no source answered, the score is null.
 *
 * Relative imports only (with .ts) so `node --test` can run it like the other lib modules.
 */
import type { LegalCheckResult } from "../types/scoring";
import {
  getCompanyRealData,
  netResult,
  REAL_SOURCE_META,
  REAL_SOURCE_ORDER,
  type CompanyRealData,
  type RealDataInput,
  type RealSourceDeps,
  type RealSourceId,
  type RealSourceStatus,
} from "./real-company-sources.ts";
import { round1 } from "./util.ts";
import { tr } from "./i18n/tr.ts";

export type VerificationSourceId = RealSourceId;

export interface SourceCheckResult {
  sourceId: VerificationSourceId;
  name: string;
  institution: string;
  weight: number;
  /** What the source itself answered. */
  availability: RealSourceStatus;
  /** "unavailable" = not scored (no answer, CUI missing, or not applicable). */
  status: "clean" | "warning" | "critical" | "unavailable";
  /** 0-100, or null when the source does not enter the score. */
  score: number | null;
  summary: string;
  details: string[];
  checkedAt: string;
}

export interface MultiSourceVerificationReport {
  companyId: string;
  companyName: string;
  cui?: string | null;
  ceoName: string;
  /** Weighted mean of the scored sources; null when none answered. */
  aggregateScore: number | null;
  /** Share of the total weight that is backed by an answer (0-1). */
  coverage: number;
  hasCriticalFlag: boolean;
  sources: SourceCheckResult[];
  checkedAt: string;
}

export const SOURCE_WEIGHTS: Record<VerificationSourceId, number> = {
  portal_just: 0.3,
  anaf_general: 0.25,
  onrc_bpi: 0.2,
  anaf_bilant: 0.15,
  vies_eu: 0.1,
};

type Scored = Pick<SourceCheckResult, "status" | "score" | "summary" | "details">;

const unscored = (summary: string, details: string[] = []): Scored => ({ status: "unavailable", score: null, summary, details });

const ron = (n: number) => `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(n)} RON`;

// ---------------------------------------------------------------------------
// Per-source scoring
// ---------------------------------------------------------------------------

/** portal.just.ro: the internal legal score (severity levels, identity confidence, the user's confirmations). */
export function scorePortal(legal: LegalCheckResult | null): Scored {
  if (!legal) return unscored(tr("Verificarea portal.just.ro nu a rulat încă."));
  if (legal.isFallback) return unscored(legal.message);
  const details = legal.cases
    .filter((c) => c.severity > 0)
    .slice(0, 6)
    .map((c) => `${c.numar} · ${c.kindLabel} · ${c.severityLabel} (${c.matchedBy === "firma" ? "firmă" : "administrator"})`);
  if (legal.uncertainCount) details.push(tr("{a} dosar(e) ale administratorului de confirmat (posibili omonimi).", { a: legal.uncertainCount }));
  const status = legal.integrityKillSwitch ? "critical" : legal.legalScore < 100 ? "warning" : "clean";
  return {
    status,
    score: legal.legalScore,
    summary: legal.cases.length ? tr("{a} dosare pe numele exact · scor legal {b}/100.", { a: legal.cases.length, b: legal.legalScore }) : tr("Niciun dosar pe numele exact al firmei sau al administratorului."),
    details,
  };
}

/** ANAF: 100 = active · 0 = fiscally inactive or deregistered. */
export function scoreAnafGeneral(real: CompanyRealData): Scored {
  const src = real.sources.find((s) => s.sourceId === "anaf_general");
  const a = real.anaf;
  if (!a) return src?.status === "not_found" ? { ...unscored(src.rawSummary, [tr("Verifică CUI-ul introdus în Pasul 1.")]), status: "warning" } : unscored(src?.rawSummary ?? tr("ANAF nu a fost interogat."));
  const details = [
    `${a.denumire} · ${a.nrRegCom || tr("fără nr. Reg. Com.")} · CAEN ${a.codCaen || "—"}`,
    a.adresa,
    a.scpTva ? tr("Înregistrată în scopuri de TVA.") : tr("Neînregistrată în scopuri de TVA."),
    a.tvaLaIncasare ? "Aplică TVA la încasare." : "",
    a.splitTva ? "Înscrisă în registrul split TVA." : "",
    a.eFactura ? tr("Înscrisă în Registrul RO e-Factura.") : tr("Nu figurează în Registrul RO e-Factura."),
    tr("Datoriile la bugetul de stat nu sunt publice prin acest serviciu: banca cere certificatul de atestare fiscală."),
  ].filter(Boolean);
  if (a.inactiv) return { status: "critical", score: 0, summary: `Contribuabil INACTIV fiscal${a.dataInactivare ? ` din ${a.dataInactivare}` : ""} — blocaj bancar major.`, details };
  if (a.dataRadiere) return { status: "critical", score: 0, summary: tr("Firmă radiată ({a}).", { a: a.dataRadiere }), details };
  return { status: "clean", score: 100, summary: tr("Activă fiscal, fără observații pe registrele publice ANAF."), details };
}

/** ONRC + insolvency: 0 = deregistered / dissolved / suspended / inactive / insolvency case · 50 < 12 months · 75 < 24 months · 100. */
export function scoreOnrcBpi(real: CompanyRealData): Scored {
  const src = real.sources.find((s) => s.sourceId === "onrc_bpi");
  const o = real.onrc;
  if (!o) return unscored(src?.rawSummary ?? tr("Starea juridică nu a fost verificată."));
  const details = [
    `${tr("Stare înregistrare: {a}", { a: o.stareInregistrare || "—" })}${o.nrRegCom ? ` · ${o.nrRegCom}` : ""}.`,
    o.insolventaVerificata ? (o.insolventa.length ? tr("Dosare de insolvență: {a}.", { a: o.insolventa.join("; ") }) : tr("Fără dosare de insolvență pe numele firmei în portal.just.ro.")) : tr("Insolvența nu a putut fi verificată (portal.just.ro indisponibil)."),
    tr("BPI (bpi.onrc.ro) nu are API public gratuit; procedurile de insolvență se judecă la tribunal și apar în portal.just.ro."),
  ];
  if (o.stareJuridica !== "În funcțiune") return { status: "critical", score: 0, summary: tr("Stare juridică: {a} — firma nu poate contracta credite.", { a: tr(o.stareJuridica) }), details };
  if (o.insolventa.length) return { status: "critical", score: 0, summary: tr("Procedură de insolvență pe numele firmei ({a} dosar(e)).", { a: o.insolventa.length }), details };
  const m = o.vechimeLuni;
  if (m === null) return { status: "warning", score: null, summary: tr("În funcțiune; data înregistrării lipsește din registru."), details };
  const age = m >= 24 ? `${Math.floor(m / 12)} ani` : `${m} luni`;
  if (m < 12) return { status: "warning", score: 50, summary: tr("În funcțiune, firmă nouă ({a}) — majoritatea băncilor cer minimum 12 luni.", { a: age }), details };
  if (m < 24) return { status: "warning", score: 75, summary: tr("În funcțiune, vechime {a} (băncile preferă peste 24 de luni).", { a: age }), details };
  return { status: "clean", score: 100, summary: tr("În funcțiune, vechime {a}.", { a: age }), details };
}

/** Balance sheet: 10 = negative equity · 40 = net loss · 70 = debts > 3× equity · 85 = turnover down > 20% · 100. */
export function scoreBilant(real: CompanyRealData): Scored {
  const src = real.sources.find((s) => s.sourceId === "anaf_bilant");
  const [y, prev] = real.bilant;
  if (!y) return unscored(src?.rawSummary ?? tr("Bilanțul nu a fost interogat."));
  const result = netResult(y);
  const leverage = y.capitaluriProprii > 0 ? y.datorii / y.capitaluriProprii : null;
  const drop = prev && prev.cifraAfaceri > 0 ? (y.cifraAfaceri - prev.cifraAfaceri) / prev.cifraAfaceri : null;
  const details = [
    `${tr("Cifră de afaceri {y}: {v}", { y: y.an, v: ron(y.cifraAfaceri) })}${prev ? ` (${prev.an}: ${ron(prev.cifraAfaceri)})` : ""}.`,
    `Rezultat net: ${ron(result)} · venituri ${ron(y.venituriTotale)} · cheltuieli ${ron(y.cheltuieliTotale)}.`,
    `Capitaluri proprii ${ron(y.capitaluriProprii)} · datorii ${ron(y.datorii)}${leverage !== null ? ` (${leverage.toFixed(1).replace(".", ",")}× capitalurile)` : ""}.`,
    tr("{a} salariați (medie).", { a: y.salariati }),
  ];
  if (y.capitaluriProprii < 0) return { status: "critical", score: 10, summary: tr("Capitaluri proprii negative în {a} — majoritatea băncilor resping dosarul până la majorarea capitalului.", { a: y.an }), details };
  if (result < 0) return { status: "warning", score: 40, summary: tr("Pierdere netă de {a} în {b}.", { a: ron(-result), b: y.an }), details };
  if (leverage !== null && leverage > 3) return { status: "warning", score: 70, summary: tr("Profit în {a}, dar datoriile sunt de {b}× capitalurile proprii.", { a: y.an, b: leverage.toFixed(1).replace(".", ",") }), details };
  if (drop !== null && drop < -0.2) return { status: "warning", score: 85, summary: tr("Profit în {a}, dar cifra de afaceri a scăzut cu {b}% față de {c}.", { a: y.an, b: Math.round(-drop * 100), c: prev!.an }), details };
  return { status: "clean", score: 100, summary: tr("Profit net de {a} în {b}, capitaluri proprii pozitive.", { a: ron(result), b: y.an }), details };
}

/** VIES: 100 = valid · 70 = VAT payer without a valid intra-EU code · not scored when the firm is not a VAT payer. */
export function scoreVies(real: CompanyRealData): Scored {
  const src = real.sources.find((s) => s.sourceId === "vies_eu");
  if (!real.vies) return unscored(src?.rawSummary ?? tr("VIES nu a fost interogat."));
  const details = [real.vies.name && `Nume VIES: ${real.vies.name}`, real.vies.address && tr("Adresă VIES: {a}", { a: real.vies.address })].filter(Boolean) as string[];
  if (real.vies.isValid) return { status: "clean", score: 100, summary: "Cod TVA intracomunitar valid (VIES).", details };
  if (real.anaf?.scpTva) return { status: "warning", score: 70, summary: tr("Plătitoare de TVA în România, dar fără cod valid în VIES (nu poate factura intracomunitar fără TVA)."), details };
  return unscored(tr("Neînregistrată în VIES — neaplicabil pentru o firmă neplătitoare de TVA."), details);
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

/** Weighted mean over the sources that have a score; null when none does. */
export function aggregateSources(sources: Pick<SourceCheckResult, "weight" | "score">[]) {
  const scored = sources.filter((s): s is Pick<SourceCheckResult, "weight"> & { score: number } => typeof s.score === "number");
  const totalWeight = scored.reduce((s, x) => s + x.weight, 0);
  if (totalWeight === 0) return null;
  return round1(scored.reduce((s, x) => s + x.weight * x.score, 0) / totalWeight);
}

/** S_Uman = 0.50 · ScorQuiz + 0.50 · ScorVerificariExterne. */
export const computeHumanScore = (quizScore: number, externalScore: number) => round1(0.5 * quizScore + 0.5 * externalScore);

export interface ReportIdentity {
  companyId: string;
  companyName: string;
  ceoName: string;
}

/** Pure: real data + the current portal.just.ro result (with the user's confirmations) → report. */
export function scoreRealData(real: CompanyRealData, legal: LegalCheckResult | null, id: ReportIdentity): MultiSourceVerificationReport {
  const scorers: Record<VerificationSourceId, () => Scored> = {
    portal_just: () => scorePortal(legal),
    anaf_general: () => scoreAnafGeneral(real),
    onrc_bpi: () => scoreOnrcBpi(real),
    anaf_bilant: () => scoreBilant(real),
    vies_eu: () => scoreVies(real),
  };
  const sources: SourceCheckResult[] = REAL_SOURCE_ORDER.map((sourceId) => {
    const raw = real.sources.find((s) => s.sourceId === sourceId);
    const availability: RealSourceStatus = sourceId === "portal_just" ? (!legal || legal.isFallback ? "unavailable" : legal.cases.length ? "verified" : "not_found") : (raw?.status ?? "unavailable");
    return { sourceId, ...REAL_SOURCE_META[sourceId], weight: SOURCE_WEIGHTS[sourceId], availability, ...scorers[sourceId](), checkedAt: sourceId === "portal_just" ? legal?.checkedAt || real.checkedAt : (raw?.checkedAt ?? real.checkedAt) };
  });
  const coverage = round1(sources.filter((s) => s.score !== null).reduce((s, x) => s + x.weight, 0) * 100) / 100;
  return {
    ...id,
    cui: real.cui || null,
    aggregateScore: aggregateSources(sources),
    coverage,
    hasCriticalFlag: sources.some((s) => s.status === "critical"),
    sources,
    checkedAt: real.checkedAt,
  };
}

export interface VerificationInput extends RealDataInput {
  companyId: string;
  companyName: string;
  ceoName: string;
  /** A portal.just.ro result already computed (keeps the user's confirmations); otherwise `checkPortal` runs it. */
  legal?: LegalCheckResult | null;
}

/** Runs the 5 real sources and scores them. Never throws and never invents a value. */
export async function verifyAllSources(
  input: VerificationInput,
  deps: RealSourceDeps & { checkPortal?: (q: { companyName: string; ceoName: string; companyCounty?: string }) => Promise<LegalCheckResult> } = {},
) {
  const real = await getCompanyRealData(input, { ...deps, legal: input.legal ?? null, checkPortal: input.legal ? undefined : deps.checkPortal });
  const report = scoreRealData(real, real.legal, { companyId: input.companyId, companyName: input.companyName, ceoName: input.ceoName });
  return { real, report };
}
