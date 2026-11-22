import type { Metadata } from "next";
import { BusinessPricingSection } from "@/components/BusinessPricingSection";

export const metadata: Metadata = {
  title: "Plan Business & Contabili",
  description:
    "Planul Business pentru grupuri de firme, cabinete de contabilitate și brokeri de credite: firme nelimitate, alerte de risc, sincronizare SPV și suport prioritar.",
};

export default function BusinessPricingPage() {
  return <BusinessPricingSection />;
}
