const ronFmt = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 });

export const formatRon = (n: number) => `${ronFmt.format(n)} RON`;
export const formatNumber = (n: number) => numFmt.format(n);
export const formatPct = (n: number) => `${numFmt.format(n)}%`;
export const formatPoints = (n: number) => numFmt.format(n);

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });

/** "1.234.567" -> 1234567, "" -> null */
export function parseRonInput(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  return digits === "" ? null : Number(digits);
}
