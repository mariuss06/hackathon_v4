/**
 * RO e-Factura parser (UBL 2.1 / RO_CIUS). Works in the browser and on the server.
 * Supports <Invoice> (InvoiceTypeCode 380/381/...) and <CreditNote> (CreditNoteTypeCode 381),
 * plus the SPV download wrapper that embeds the invoice inside another root element.
 */
import { XMLParser } from "fast-xml-parser";
import type { Company, Invoice } from "../../types/scoring";
import { invoiceKey, isSameParty } from "../company.ts";
import { round2 } from "../util.ts";
import { tr } from "../i18n/tr.ts";

export interface ParseResult {
  ok: boolean;
  /** How the invoice was linked to the active company (CUI match, name match, or not matched). */
  matchedBy?: "cui" | "nume" | "nepotrivit";
  fileName: string;
  invoice?: Invoice;
  warnings: string[];
  error?: string;
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

type Node = Record<string, unknown> | undefined;

const text = (v: unknown): string => {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") return text((v as Record<string, unknown>)["#text"]);
  return String(v).trim();
};
const child = (n: Node, ...path: string[]): Node =>
  path.reduce<Node>((cur, key) => {
    const next = cur?.[key];
    return (Array.isArray(next) ? next[0] : next) as Node;
  }, n);
const value = (n: Node, ...path: string[]) => {
  const last = path[path.length - 1];
  const parent = child(n, ...path.slice(0, -1));
  const v = parent?.[last];
  return text(Array.isArray(v) ? v[0] : v);
};

/** Locate the UBL document even inside the SPV wrapper. */
function findDocument(doc: Record<string, unknown>): { root: Node; kind: "Invoice" | "CreditNote" } | null {
  for (const kind of ["Invoice", "CreditNote"] as const) if (doc[kind]) return { root: doc[kind] as Node, kind };
  for (const v of Object.values(doc)) {
    if (v && typeof v === "object") {
      const found = findDocument(v as Record<string, unknown>);
      if (found) return found;
    }
  }
  return null;
}

function party(root: Node, role: "AccountingSupplierParty" | "AccountingCustomerParty") {
  const p = child(root, role, "Party");
  const name =
    value(p, "PartyLegalEntity", "RegistrationName") || value(p, "PartyName", "Name") || "Necunoscut";
  const cui = value(p, "PartyTaxScheme", "CompanyID") || value(p, "PartyLegalEntity", "CompanyID") || value(p, "PartyIdentification", "ID");
  return { name, cui };
}

const toNumber = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export function parseEFacturaXml(xml: string, fileName: string, company: Company): ParseResult {
  const warnings: string[] = [];
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch (e) {
    return { ok: false, fileName, warnings, error: `XML invalid: ${e instanceof Error ? e.message : tr("eroare de parsare")}` };
  }
  const found = findDocument(doc);
  if (!found) return { ok: false, fileName, warnings, error: tr("Nu este un document UBL 2.1 (lipsește <Invoice> sau <CreditNote>).") };
  const { root, kind } = found;

  const number = value(root, "ID");
  const issueDate = value(root, "IssueDate");
  const typeCode = value(root, kind === "Invoice" ? "InvoiceTypeCode" : "CreditNoteTypeCode") || (kind === "CreditNote" ? "381" : "380");
  const dueDate = value(root, "DueDate") || value(root, "PaymentMeans", "PaymentDueDate") || null;
  const currency = value(root, "DocumentCurrencyCode") || "RON";
  const totals = child(root, "LegalMonetaryTotal");
  const taxExclusive = toNumber(value(totals, "TaxExclusiveAmount"));
  const payable = toNumber(value(totals, "PayableAmount"));

  const missing = [
    !number && "cbc:ID",
    !/^\d{4}-\d{2}-\d{2}$/.test(issueDate) && "cbc:IssueDate",
    Number.isNaN(taxExclusive) && "cbc:TaxExclusiveAmount",
  ].filter(Boolean);
  if (missing.length) return { ok: false, fileName, warnings, error: tr("Câmpuri obligatorii lipsă: {a}.", { a: missing.join(", ") }) };

  const supplier = party(root, "AccountingSupplierParty");
  const customer = party(root, "AccountingCustomerParty");
  // Issued (sale) when the active company is the supplier, received (purchase) when it is the customer.
  // CUI decides when both sides have one; otherwise the normalized names (no "SRL"/"SC", no diacritics).
  let direction: Invoice["direction"] = "issued";
  let matchedBy: ParseResult["matchedBy"] = "nepotrivit";
  const via = (p: { cui: string }) => (company.cui && p.cui ? "cui" : "nume");
  if (isSameParty(supplier, company)) {
    direction = "issued";
    matchedBy = via(supplier);
  } else if (isSameParty(customer, company)) {
    direction = "received";
    matchedBy = via(customer);
  } else {
    const who = company.cui ? `CUI-ul ${company.cui} / numele „${company.name}”` : tr("numele „{a}” (firma nu are CUI)", { a: company.name });
    warnings.push(tr("Firma activă nu apare ca furnizor sau client ({a}); factura a fost atașată firmei active ca emisă. Verifică dacă ai selectat firma corectă.", { a: who }));
  }
  if (matchedBy === "nume") warnings.push(tr("Factura a fost potrivită cu firma activă după nume (fără CUI)."));

  if (currency !== "RON") warnings.push(tr("Moneda {a}: sumele sunt folosite ca atare, fără conversie în RON.", { a: currency }));
  if (typeCode === "381") warnings.push(tr("Factură storno (381): reduce cifra de afaceri și crește rata de stornări."));
  if (!dueDate && typeCode !== "381") warnings.push(tr("Fără DueDate: factura nu intră în calculul termenului de plată."));

  const invoice: Invoice = {
    id: "",
    number,
    direction,
    typeCode,
    issueDate,
    dueDate,
    supplierName: supplier.name,
    supplierCui: supplier.cui,
    customerName: customer.name,
    customerCui: customer.cui,
    taxExclusiveAmount: round2(taxExclusive),
    payableAmount: Number.isNaN(payable) ? round2(taxExclusive) : round2(payable),
    currency,
    paidDate: null,
    source: "xml-upload",
  };
  invoice.id = invoiceKey(invoice);
  return { ok: true, fileName, invoice, warnings, matchedBy };
}
