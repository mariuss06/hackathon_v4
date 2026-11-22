import type { Metadata } from "next";
import { HomeNav } from "@/components/home/HomeNav";
import { HeroSection } from "@/components/home/HeroSection";
import { TrustBar } from "@/components/home/TrustBar";
import { HowItWorks } from "@/components/home/HowItWorks";
import { BusinessSection } from "@/components/home/BusinessSection";
import { FaqSection } from "@/components/home/FaqSection";
import { HomeFooter } from "@/components/home/HomeFooter";

export const metadata: Metadata = {
  title: "CrediFit — Credit Readiness pentru IMM",
  description:
    "Află cum îți evaluează băncile din România compania: încarci facturile e-Factura, parcurgi quiz-urile despre firmă și finanțare, iar scorul, planul 30–90 zile și raportul PDF se dezvăluie abia la final.",
};

/** Marketing home page: sticky navbar, hero, trust bar, 4-step flow, B2B, FAQ, footer. */
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <HomeNav />
      <main className="flex-1">
        <HeroSection />
        <TrustBar />
        <HowItWorks />
        <BusinessSection />
        <FaqSection />
      </main>
      <HomeFooter />
    </div>
  );
}
