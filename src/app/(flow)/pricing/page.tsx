import type { Metadata } from "next";
import { PricingSection } from "@/components/PricingSection";
import { RoiComparison } from "@/components/RoiComparison";
import { FeatureMatrix, PricingFaq } from "@/components/PricingDetails";
import { ClientDisclaimer } from "@/components/LegalDoc";
import { PricingHeader } from "@/components/PricingHeader";

export const metadata: Metadata = {
  title: "Prețuri și planuri",
  description: "Planurile CrediFit pentru IMM-uri și contabili: Starter, Pro și Business, plus analiza Pay-Per-Use și calculatorul de economii față de consultanța clasică.",
};

export default function PricingPage() {
  return (
    <div className="space-y-10">
      <PricingHeader />
      <PricingSection />
      <RoiComparison />
      <FeatureMatrix />
      <PricingFaq />
      <ClientDisclaimer />
    </div>
  );
}
