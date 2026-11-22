/**
 * ORIENTATIVE sector reference values: [p25, median, p75] of each indicator.
 * They are estimates of plausible orders of magnitude for Romanian SMEs, NOT official statistics
 * (no free public source publishes these percentiles per CAEN). The UI labels them as such; replace
 * them with INS / BNR / bank data when available (same values are in the `sector_benchmarks` table).
 *
 * The key (`caenCode`) is the reference CAEN code of the sector, or "IMM" for the
 * all-sector SME benchmark used when neither a CAEN code nor a sector is known.
 */
import type { SectorBenchmark } from "../../types/scoring";

export const GENERAL_SECTOR = "IMM";

export const SECTOR_BENCHMARKS: SectorBenchmark[] = [
  {
    caenCode: "5610",
    shortLabel: "HoReCa / Restaurante",
    label: "Restaurante, hoteluri și catering (HoReCa)",
    seasonal: true,
    companies: 1280,
    dsoDays: [5, 12, 25],
    topClientSharePct: [6, 12, 22],
    creditNotesPct: [0.4, 1.1, 2.4],
    seasonalityRatio: [1.3, 1.7, 2.3],
    grossMarginPct: [55, 63, 70],
  },
  {
    caenCode: "4639",
    shortLabel: "Distribuție / Comerț en-gros",
    label: "Comerț cu ridicata nespecializat de alimente, băuturi și tutun",
    seasonal: false,
    companies: 412,
    dsoDays: [30, 42, 58],
    topClientSharePct: [16, 24, 35],
    creditNotesPct: [1.2, 2.5, 4.5],
    seasonalityRatio: [1.35, 1.6, 1.95],
    grossMarginPct: [14, 19, 24],
  },
  {
    caenCode: "4711",
    shortLabel: "Retail / Comerț cu amănuntul",
    label: "Comerț cu amănuntul în magazine nespecializate (alimentar)",
    seasonal: false,
    companies: 960,
    dsoDays: [3, 8, 18],
    topClientSharePct: [5, 10, 20],
    creditNotesPct: [0.3, 0.9, 2.0],
    seasonalityRatio: [1.2, 1.4, 1.7],
    grossMarginPct: [18, 23, 28],
  },
  {
    caenCode: "1071",
    shortLabel: "Producție alimentară",
    label: "Fabricarea pâinii și a produselor alimentare proaspete",
    seasonal: true,
    companies: 530,
    dsoDays: [20, 32, 48],
    topClientSharePct: [18, 28, 42],
    creditNotesPct: [1.5, 3.0, 5.5],
    seasonalityRatio: [1.15, 1.3, 1.55],
    grossMarginPct: [28, 35, 42],
  },
  {
    caenCode: "0111",
    shortLabel: "Agricultură",
    label: "Cultivarea cerealelor, plantelor leguminoase și a plantelor oleaginoase",
    seasonal: true,
    companies: 2140,
    dsoDays: [25, 40, 65],
    topClientSharePct: [25, 38, 55],
    creditNotesPct: [0.3, 1.0, 2.5],
    seasonalityRatio: [2.0, 3.2, 5.0],
    grossMarginPct: [18, 26, 34],
  },
  {
    caenCode: "4941",
    shortLabel: "Transport rutier",
    label: "Transporturi rutiere de mărfuri",
    seasonal: false,
    companies: 1710,
    dsoDays: [35, 50, 70],
    topClientSharePct: [20, 32, 48],
    creditNotesPct: [0.8, 1.8, 3.5],
    seasonalityRatio: [1.2, 1.4, 1.75],
    grossMarginPct: [22, 30, 38],
  },
  {
    caenCode: "4120",
    shortLabel: "Construcții",
    label: "Lucrări de construcții a clădirilor rezidențiale și nerezidențiale",
    seasonal: true,
    companies: 1530,
    dsoDays: [35, 55, 80],
    topClientSharePct: [25, 40, 60],
    creditNotesPct: [0.5, 1.5, 3.0],
    seasonalityRatio: [1.5, 2.0, 2.8],
    grossMarginPct: [15, 22, 30],
  },
  {
    caenCode: "6201",
    shortLabel: "IT / Software",
    label: "Activități de realizare a software-ului la comandă",
    seasonal: false,
    companies: 880,
    dsoDays: [25, 38, 55],
    topClientSharePct: [25, 40, 60],
    creditNotesPct: [0.2, 0.8, 2.0],
    seasonalityRatio: [1.15, 1.35, 1.7],
    grossMarginPct: [45, 60, 75],
  },
  {
    caenCode: GENERAL_SECTOR,
    shortLabel: "General IMM",
    label: "General IMM (toate sectoarele, medie națională)",
    seasonal: false,
    companies: 9400,
    dsoDays: [20, 35, 55],
    topClientSharePct: [15, 27, 42],
    creditNotesPct: [0.5, 1.5, 3.0],
    seasonalityRatio: [1.25, 1.5, 1.9],
    grossMarginPct: [18, 27, 38],
  },
];

/** CAEN code (4 digits) → benchmark sector key. First matching rule wins. */
const CAEN_RULES: { test: (caen: string) => boolean; sector: string }[] = [
  { test: (c) => /^5[56]/.test(c), sector: "5610" }, // 55xx cazare, 56xx restaurante și baruri → HoReCa
  { test: (c) => /^46/.test(c), sector: "4639" }, // 46xx comerț cu ridicata → Distribuție
  { test: (c) => /^4[57]/.test(c), sector: "4711" }, // 45xx auto, 47xx comerț cu amănuntul → Retail
  { test: (c) => /^1[01]/.test(c), sector: "1071" }, // 10xx-11xx industrie alimentară și băuturi
  { test: (c) => /^0[1-3]/.test(c), sector: "0111" }, // 01-03 agricultură, silvicultură, pescuit
  { test: (c) => /^49|^5[23]/.test(c), sector: "4941" }, // 49xx transport terestru, 52-53 depozitare, curierat
  { test: (c) => /^4[123]/.test(c), sector: "4120" }, // 41-43 construcții
  { test: (c) => /^6[23]|^58/.test(c), sector: "6201" }, // 62-63 IT, 58 editare software
];

/** "5610" / "CAEN 5610" / "5610 - Restaurante" → "5610"; anything else → "". */
export function cleanCaen(raw: string | null | undefined) {
  const m = (raw ?? "").match(/\d{4}/);
  return m ? m[0] : "";
}

/** Benchmark sector key for a CAEN code, or null when the code is missing / not covered. */
export function sectorForCaen(raw: string | null | undefined): string | null {
  const caen = cleanCaen(raw);
  if (!caen) return null;
  return CAEN_RULES.find((r) => r.test(caen))?.sector ?? null;
}

export const findSector = (key: string | null | undefined) =>
  SECTOR_BENCHMARKS.find((s) => s.caenCode === key) ?? SECTOR_BENCHMARKS.find((s) => s.caenCode === GENERAL_SECTOR)!;

/**
 * Sector used for the industry comparison in S_Investiție:
 *  1. CAEN code present and mapped → that sector;
 *  2. otherwise the sector picked in the dropdown;
 *  3. otherwise "General IMM".
 */
export function resolveSector(company: { caenCode?: string; sector?: string }) {
  const fromCaen = sectorForCaen(company.caenCode);
  const key = fromCaen ?? company.sector ?? GENERAL_SECTOR;
  return { sector: findSector(key), source: fromCaen ? ("caen" as const) : company.sector ? ("manual" as const) : ("default" as const) };
}
