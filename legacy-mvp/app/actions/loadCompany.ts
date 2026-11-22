"use server";

import { getCompanyGroundTruth } from "@/data/mockCompanyData";
import type { CompanyAssessment } from "@/types/scoring";

/** Server-side entry point; the UI never imports the data layer directly. */
export async function loadCompanyAssessment(companyId?: string): Promise<CompanyAssessment> {
  return getCompanyGroundTruth(companyId);
}
