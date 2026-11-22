/**
 * Romanian personal numeric code (CNP) — real validation, masking and identity hints.
 *
 * Structure: S AA LL ZZ JJ NNN C (13 digits)
 *   S   sex + century: 1/2 = 1900-1999, 3/4 = 1800-1899, 5/6 = 2000-2099, 7/8 = foreign residents, 9 = foreigners
 *   AA LL ZZ  date of birth
 *   JJ  county code (01-46, 51-52 Călărași / Giurgiu, 47-48 old Bucharest sectors 7-8)
 *   NNN serial number (001-999)
 *   C   control digit: Σ digit[i] · "279146358279"[i] mod 11; 10 → 1
 *
 * GDPR: the raw CNP is never stored or sent anywhere. Only the masked form ("1900101******")
 * and the derived hints (birth date, sex, county) are kept to tell namesakes apart.
 *
 * Pure module (type-only imports): tested with `node --test`.
 */
import type { CourtCase, LegalCheckResult } from "../types/scoring";
import { tr } from "./i18n/tr.ts";

export const CNP_CONTROL_KEY = "279146358279";

/** County codes of the CNP (JJ). */
export const CNP_COUNTIES: Record<string, string> = {
  "01": "Alba",
  "02": "Arad",
  "03": "Argeș",
  "04": "Bacău",
  "05": "Bihor",
  "06": "Bistrița-Năsăud",
  "07": "Botoșani",
  "08": "Brașov",
  "09": "Brăila",
  "10": "Buzău",
  "11": "Caraș-Severin",
  "12": "Cluj",
  "13": "Constanța",
  "14": "Covasna",
  "15": "Dâmbovița",
  "16": "Dolj",
  "17": "Galați",
  "18": "Gorj",
  "19": "Harghita",
  "20": "Hunedoara",
  "21": "Ialomița",
  "22": "Iași",
  "23": "Ilfov",
  "24": "Maramureș",
  "25": "Mehedinți",
  "26": "Mureș",
  "27": "Neamț",
  "28": "Olt",
  "29": "Prahova",
  "30": "Satu Mare",
  "31": "Sălaj",
  "32": "Sibiu",
  "33": "Suceava",
  "34": "Teleorman",
  "35": "Timiș",
  "36": "Tulcea",
  "37": "Vaslui",
  "38": "Vâlcea",
  "39": "Vrancea",
  "40": "București",
  "41": "București",
  "42": "București",
  "43": "București",
  "44": "București",
  "45": "București",
  "46": "București",
  "47": "București",
  "48": "București",
  "51": "Călărași",
  "52": "Giurgiu",
};

export interface CnpInfo {
  /** "1900101******": sex/century + birth date visible, county/serial/control hidden. */
  masked: string;
  /** YYYY-MM-DD */
  birthDate: string;
  /** null for code 9 (foreigners: sex not encoded). */
  sex: "M" | "F" | null;
  countyCode: string;
  county: string;
  /** Foreign resident / foreigner codes (7, 8, 9). */
  resident: boolean;
}

export type CnpValidation = { valid: true; info: CnpInfo } | { valid: false; error: string };

const CENTURY: Record<string, number> = { "1": 1900, "2": 1900, "3": 1800, "4": 1800, "5": 2000, "6": 2000 };

export const cleanCnp = (raw: string) => raw.replace(/\D/g, "");

export function cnpControlDigit(first12: string) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * Number(CNP_CONTROL_KEY[i]);
  const r = sum % 11;
  return r === 10 ? 1 : r;
}

export const maskCnp = (cnp: string) => `${cleanCnp(cnp).slice(0, 7)}******`;

/**
 * Full validation: 13 digits, sex/century digit, a real calendar date not in the future,
 * a known county code, serial 001-999 and the control digit.
 * `today` (YYYY-MM-DD) is injectable for tests; defaults to the current date.
 */
export function validateCnp(raw: string, today: string = new Date().toISOString().slice(0, 10)): CnpValidation {
  const cnp = cleanCnp(raw);
  if (cnp.length !== 13) return { valid: false, error: "CNP-ul are exact 13 cifre." };
  const s = cnp[0];
  if (s === "0") return { valid: false, error: tr("Prima cifră (sex / secol) nu poate fi 0.") };
  const yy = Number(cnp.slice(1, 3));
  const mm = Number(cnp.slice(3, 5));
  const dd = Number(cnp.slice(5, 7));
  let year: number;
  if (CENTURY[s] !== undefined) {
    year = CENTURY[s] + yy;
  } else {
    // 7, 8, 9: residents / foreigners — century not encoded; the most recent plausible one.
    const currentYY = Number(today.slice(2, 4));
    year = (yy <= currentYY ? 2000 : 1900) + yy;
  }
  const date = new Date(Date.UTC(year, mm - 1, dd));
  if (mm < 1 || mm > 12 || date.getUTCFullYear() !== year || date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) {
    return { valid: false, error: tr("Data nașterii din CNP (cifrele 2–7) nu este o dată validă.") };
  }
  const birthDate = date.toISOString().slice(0, 10);
  if (birthDate > today) return { valid: false, error: tr("Data nașterii din CNP este în viitor.") };
  const countyCode = cnp.slice(7, 9);
  const county = CNP_COUNTIES[countyCode];
  if (!county) return { valid: false, error: tr("Codul de județ {a} (cifrele 8–9) nu există.", { a: countyCode }) };
  if (cnp.slice(9, 12) === "000") return { valid: false, error: tr("Numărul de ordine (cifrele 10–12) nu poate fi 000.") };
  if (cnpControlDigit(cnp.slice(0, 12)) !== Number(cnp[12])) return { valid: false, error: tr("Cifra de control nu corespunde (cheia 279146358279).") };
  return {
    valid: true,
    info: {
      masked: maskCnp(cnp),
      birthDate,
      sex: s === "9" ? null : ["1", "3", "5", "7"].includes(s) ? "M" : "F",
      countyCode,
      county,
      resident: s === "7" || s === "8" || s === "9",
    },
  };
}

/** Full years between the birth date and `onDate` (both YYYY-MM-DD). */
export function ageOn(birthDate: string, onDate: string) {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [y, m, d] = onDate.slice(0, 10).split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Criminal responsibility starts at 14 (Codul penal, art. 113); a company can be administered from 18. */
const MIN_AGE_PENAL = 14;
const MIN_AGE_BUSINESS = 18;

/**
 * Uses the validated CNP to tell namesakes apart in the administrator's portal.just.ro cases
 * (the portal shows names only). A case filed when the administrator was too young to be a party
 * in that kind of case cannot be theirs: it is marked "contestat" (namesake) automatically, unless
 * the user already answered. A court in the CNP county adds a confidence note. Returns the legal
 * result re-scored with `rescore` (scoringEngine.rescoreLegal), or the same object when nothing changes.
 */
export function applyCnpToLegal(
  legal: LegalCheckResult | null,
  info: Pick<CnpInfo, "birthDate" | "county" | "masked"> | null | undefined,
  rescore: (r: LegalCheckResult) => LegalCheckResult,
  courtCounties: (institutie: string) => string[],
): LegalCheckResult | null {
  if (!legal || !info || legal.isFallback) return legal;
  let changed = false;
  const cases: CourtCase[] = legal.cases.map((c) => {
    if (c.matchedBy !== "administrator" || !c.data) return c;
    const age = ageOn(info.birthDate, c.data);
    const penal = c.kind.startsWith("penal") || c.kind === "contraventie";
    const minAge = penal ? MIN_AGE_PENAL : MIN_AGE_BUSINESS;
    const sameCounty = courtCounties(c.institutie).includes(info.county);
    const reasons = [...(c.confidenceReasons ?? [])];
    if (age < minAge && !c.userVerdict) {
      changed = true;
      reasons.push(tr("CNP {a}: la data dosarului administratorul avea {b} ani (sub {c}) — omonim, exclus automat.", { a: info.masked, b: Math.max(0, age), c: minAge }));
      return { ...c, userVerdict: "contestat", confidence: "scazuta", confidenceReasons: reasons };
    }
    if (sameCounty && !reasons.some((r) => r.startsWith("CNP"))) {
      changed = true;
      reasons.push(tr("CNP {a}: instanța este în județul de naștere din CNP ({b}).", { a: info.masked, b: info.county }));
      return { ...c, confidenceReasons: reasons };
    }
    return c;
  });
  return changed ? rescore({ ...legal, cases }) : legal;
}
