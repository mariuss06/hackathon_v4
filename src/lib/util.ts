/** Small pure helpers shared by the data layer and the scoring engine (no imports). */

const DAY_MS = 86_400_000;

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** "2026-03" + n months. */
export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function lastDayOfMonth(ym: string) {
  return addDays(`${addMonths(ym, 1)}-01`, -1);
}

export const daysInMonth = (ym: string) => Number(lastDayOfMonth(ym).slice(8, 10));

/**
 * Linear score: 100 at `best`, 0 at `worst`, clamped. Works in both directions
 * (best < worst for "lower is better", best > worst for "higher is better").
 */
export function linearScore(value: number, best: number, worst: number) {
  if (!Number.isFinite(value)) return 0;
  return clamp(((value - worst) / (best - worst)) * 100, 0, 100);
}

/** Piecewise-linear interpolation through [x, y] points sorted by x (flat outside the range). */
export function piecewise(value: number, points: [number, number][]) {
  if (value <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (value <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

/** "RO 12.345.678" -> "12345678" */
export const normCui = (s: string) => s.replace(/\D/g, "");

/**
 * Display locale for numbers and month names. Romanian by default (server, tests, scoring texts);
 * the client LanguageProvider switches it to "en-GB" when the interface is in English.
 */
export type NumberLocale = "ro-RO" | "en-GB";
let locale: NumberLocale = "ro-RO";
const fmtCache = new Map<string, Intl.NumberFormat>();
const fmt = (digits: number) => {
  const key = `${locale}|${digits}`;
  let f = fmtCache.get(key);
  if (!f) fmtCache.set(key, (f = new Intl.NumberFormat(locale, { maximumFractionDigits: digits })));
  return f;
};

export const setNumberLocale = (l: NumberLocale) => {
  locale = l;
};
export const getNumberLocale = () => locale;

export const ron = (n: number) => `${fmt(0).format(n)} RON`;
export const pct = (n: number) => `${fmt(1).format(n)}%`;
export const num = (n: number) => fmt(1).format(n);

const MONTHS: Record<NumberLocale, string[]> = {
  "ro-RO": ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"],
  "en-GB": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
/** "2026-03" -> "mar 2026" (RO) / "Mar 2026" (EN) */
export const monthLabel = (ym: string, withYear = true) =>
  `${MONTHS[locale][Number(ym.slice(5, 7)) - 1]}${withYear ? ` ${ym.slice(0, 4)}` : ""}`;
