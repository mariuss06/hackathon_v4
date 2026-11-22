import type { EFacturaGroundTruth, EFacturaInvoice } from "@/types/scoring";

const CLIENTS = [
  "Dacia Fresh Distribution SRL",
  "Agro Natura Vest SRL",
  "Bio Cosmetic Line SRL",
  "Lactis Food Industries SRL",
  "Horeca Supply Center SRL",
];

/** Builds a fake commercial invoice (InvoiceTypeCode 380). */
export function createMockInvoice(truth: EFacturaGroundTruth): EFacturaInvoice {
  const n = truth.invoices.length + 1;
  return {
    id: `SIM-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`,
    issueDate: new Date().toISOString().slice(0, 10),
    customerName: CLIENTS[Math.floor(Math.random() * CLIENTS.length)],
    amountNoVat: Math.round((8_000 + Math.random() * 27_000) / 10) * 10,
    invoiceTypeCode: "380",
    source: "simulated-upload",
  };
}

/**
 * Applies a new invoice to the ground truth and recomputes derived metrics.
 * Returns a NEW object (immutable update, safe for React state).
 *
 * TODO: Replace with a real RO e-Factura XML (UBL 2.1) parser:
 *   parse cbc:InvoiceTypeCode, cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount,
 *   cac:AccountingCustomerParty, cbc:IssueDate, cbc:DueDate ... then persist
 *   to Supabase and recompute aggregates in SQL.
 */
export function applyInvoice(
  truth: EFacturaGroundTruth,
  invoice: EFacturaInvoice,
): EFacturaGroundTruth {
  const revenueLast3MonthsNoVat = truth.revenueLast3MonthsNoVat + invoice.amountNoVat;
  return {
    ...truth,
    revenueLast3MonthsNoVat,
    annualizedRevenue: revenueLast3MonthsNoVat * 4,
    invoices: [invoice, ...truth.invoices],
  };
}

export function simulateInvoiceUpload(truth: EFacturaGroundTruth) {
  const invoice = createMockInvoice(truth);
  return { invoice, groundTruth: applyInvoice(truth, invoice) };
}
