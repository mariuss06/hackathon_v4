"use client";

import { useLanguage } from "./LanguageProvider";

/** "Credit Readiness pentru IMM" under the logo, in the interface language (hidden on very small screens). */
export function BrandTagline() {
  const { lang } = useLanguage();
  return (
    <span className="mt-1 hidden whitespace-nowrap text-[10px] uppercase tracking-[0.14em] text-faint sm:block">
      {lang === "en" ? "Credit Readiness for SMEs" : "Credit Readiness pentru IMM"}
    </span>
  );
}
