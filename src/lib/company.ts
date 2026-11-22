/**
 * Company identity helpers, shared by the browser, the API routes and the e-Factura parser.
 * CUI and CAEN are optional: when the CUI is missing, a company is identified by its
 * normalized name (case/diacritics-insensitive, legal form and punctuation ignored).
 */
import type { Company } from "../types/scoring";
import { cleanCaen } from "./data/benchmarks.ts";
import { normCui } from "./util.ts";
import { tr } from "./i18n/tr.ts";

/** Legal-form words ignored when comparing company names: "SC X SRL" = "x s.r.l." = "X". */
const LEGAL_FORMS = new Set(["sc", "srl", "srld", "sa", "snc", "scs", "sca", "ra", "pfa", "ii", "if", "ong"]);

/**
 * "S.C. Nord Fresh  Distribuție S.R.L." → "nord fresh distributie".
 * Dots are removed first so that "S.R.L." collapses to "srl" and is dropped like any legal form.
 */
export function normalizeCompanyName(name: string) {
  const tokens = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const kept = tokens.filter((t) => !LEGAL_FORMS.has(t));
  return (kept.length ? kept : tokens).join(" ");
}

/** Trimmed person name with single spaces ("  Ion   Popescu " → "Ion Popescu"). */
export const cleanPersonName = (name: string) => name.trim().replace(/\s+/g, " ");

/** "ro 45127893" / "RO45127893" / "45127893" → "RO45127893"; "" when there are no digits. */
export function formatCui(raw: string | null | undefined) {
  const digits = normCui(raw ?? "");
  return digits ? `RO${digits}` : "";
}

/** A Romanian CUI has 2-10 digits. Returns a warning (never blocks the form). */
export function cuiWarning(raw: string) {
  if (!raw.trim()) return null;
  const digits = normCui(raw);
  if (digits.length < 2 || digits.length > 10) return "CUI-ul are de obicei 2–10 cifre. Îl salvăm oricum; potrivirea se face și după nume.";
  return null;
}

export const caenWarning = (raw: string) => (raw.trim() && !cleanCaen(raw) ? "Codul CAEN are 4 cifre (ex. 5610). Alege sectorul din listă." : null);

/** Stable lookup key: CUI digits when present, otherwise the normalized name. */
export function companyKey(c: Pick<Company, "name" | "cui">) {
  const digits = normCui(c.cui ?? "");
  return digits ? `cui:${digits}` : `name:${normalizeCompanyName(c.name)}`;
}

/**
 * Is this invoice party (name + CUI from AccountingSupplierParty / AccountingCustomerParty) the active company?
 * CUI wins when both sides have one; otherwise the normalized names must be identical.
 */
export function isSameParty(party: { name: string; cui: string }, company: Pick<Company, "name" | "cui">) {
  const a = normCui(party.cui ?? "");
  const b = normCui(company.cui ?? "");
  if (a && b) return a === b;
  const n = normalizeCompanyName(party.name);
  return n.length > 0 && n === normalizeCompanyName(company.name);
}

/** Finds an existing company: same CUI if one was typed, otherwise same normalized name (and no conflicting CUI). */
export function findExistingCompany<T extends Pick<Company, "name" | "cui">>(list: T[], draft: Pick<Company, "name" | "cui">): T | undefined {
  const digits = normCui(draft.cui ?? "");
  if (digits) {
    const byCui = list.find((c) => normCui(c.cui ?? "") === digits);
    if (byCui) return byCui;
  }
  const key = normalizeCompanyName(draft.name);
  return list.find((c) => {
    if (normalizeCompanyName(c.name) !== key) return false;
    const other = normCui(c.cui ?? "");
    return !digits || !other || other === digits;
  });
}

/** Small deterministic hash (FNV-1a). */
export function hashString(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}


/** Human label for the company selector: "Nord Fresh Distribuție SRL · RO45127893" or "· fără CUI". */
export const companyLabel = (c: Pick<Company, "name" | "cui">) => `${c.name} · ${c.cui ? c.cui : tr("fără CUI")}`;

/** Stable invoice key: `${direction}:${supplierCui}:${number}`. */
export const invoiceKey = (inv: { direction: string; supplierCui: string; number: string }) => `${inv.direction}:${inv.supplierCui.replace(/D/g, "")}:${inv.number}`;

/**
 * A new company as saved from step 1. Nothing is invented: fixed costs and existing installments
 * start at 0 with financialsDeclared = false until the user declares them (step 2).
 */
export function newCompanyRecord(input: Pick<Company, "id" | "name" | "cui" | "caenCode" | "ceoName"> & Partial<Company>): Company {
  return {
    city: "",
    monthlyFixedCosts: 0,
    existingMonthlyDebtService: 0,
    financialsDeclared: false,
    debts: [],
    createdAt: new Date().toISOString(),
    ...input,
  };
}

/** Monthly installments of existing debt: the sum of the declared credit lines when any, else the declared total. */
export function effectiveDebtService(c: Pick<Company, "existingMonthlyDebtService" | "debts">) {
  return c.debts && c.debts.length > 0 ? c.debts.reduce((s, d) => s + Math.max(0, d.monthlyInstallment || 0), 0) : c.existingMonthlyDebtService;
}
