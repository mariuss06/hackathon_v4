import type {
  CompanyAssessment,
  EFacturaGroundTruth,
  SBusinessMock,
} from "@/types/scoring";

/**
 * Arbitrary but realistic data for a fictional Romanian SME.
 * Every company name / CUI here is invented.
 */
export const MOCK_COMPANY_ID = "demo-carpatica-ambalaje";

const revenueLast3MonthsNoVat = 486_350;

export const mockGroundTruth: EFacturaGroundTruth = {
  companyId: MOCK_COMPANY_ID,
  companyName: "Carpatica Ambalaje Industriale SRL",
  cui: "RO41528736",
  caenCode: "2222",
  caenLabel: "Fabricarea articolelor de ambalaj din material plastic",
  revenueLast3MonthsNoVat,
  annualizedRevenue: revenueLast3MonthsNoVat * 4,
  avgPaymentTermDays: 34, // -> bucket "30 zile"
  topClientSharePct: 38.5, // -> bucket "30-50%"
  topClientName: "Lactis Food Industries SRL",
  topSuppliers: [
    { name: "Petrochim Polimeri Distribuție SRL", cui: "RO18342291", purchaseValue: 182_400 },
    { name: "Euro Granule Trade SRL", cui: "RO30117458", purchaseValue: 96_300 },
    { name: "Transcarpat Logistic SRL", cui: "RO22985013", purchaseValue: 61_750 },
    { name: "Energo Furnizare Est SA", cui: "RO14476320", purchaseValue: 44_200 },
    { name: "Print & Etichete Nova SRL", cui: "RO37702164", purchaseValue: 27_900 },
  ],
  decoySuppliers: ["Polimer Group Balkan SRL", "Ambalaj Expert Distribution SRL"],
  creditNotesSharePct: 2.1, // < 5% -> "Nu"
  invoices: [
    { id: "CAI-2026-0918", issueDate: "2026-11-14", customerName: "Lactis Food Industries SRL", amountNoVat: 48_200, invoiceTypeCode: "380", source: "efactura-sync" },
    { id: "CAI-2026-0917", issueDate: "2026-11-11", customerName: "Dacia Fresh Distribution SRL", amountNoVat: 21_640, invoiceTypeCode: "380", source: "efactura-sync" },
    { id: "CAI-2026-0916", issueDate: "2026-11-06", customerName: "Lactis Food Industries SRL", amountNoVat: -3_150, invoiceTypeCode: "381", source: "efactura-sync" },
    { id: "CAI-2026-0915", issueDate: "2026-11-03", customerName: "Agro Natura Vest SRL", amountNoVat: 17_980, invoiceTypeCode: "380", source: "efactura-sync" },
    { id: "CAI-2026-0914", issueDate: "2026-10-29", customerName: "Bio Cosmetic Line SRL", amountNoVat: 12_400, invoiceTypeCode: "380", source: "efactura-sync" },
  ],
};

/** Initial S_Business = 0.75 * 80 + 0.25 * 72 = 78 / 100 */
export const mockSBusiness: SBusinessMock = {
  ownMetricsScore: 80,
  industryBenchmarkScore: 72,
};

/**
 * Data access entry point used by the rest of the app.
 * Returns deep copies so callers can mutate state freely.
 */
export async function getCompanyGroundTruth(
  companyId: string = MOCK_COMPANY_ID,
): Promise<CompanyAssessment> {
  // TODO: Replace with Supabase query
  //   const { data } = await supabase
  //     .from("efactura_ground_truth")
  //     .select("*, suppliers(*), invoices(*)")
  //     .eq("company_id", companyId)
  //     .single();
  void companyId;
  return structuredClone({
    groundTruth: mockGroundTruth,
    sBusinessMock: mockSBusiness,
  });
}
