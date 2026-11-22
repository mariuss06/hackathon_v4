"use client";

import { useLanguage } from "./LanguageProvider";

/** Title block of /pricing in the interface language (the page itself stays a server component for its metadata). */
export function PricingHeader() {
  const { t } = useLanguage();
  const p = t.pricingPage;
  return (
    <div className="text-center">
      <p className="text-xs text-faint">{p.eyebrow}</p>
      <h1 className="mt-2 text-balance text-[26px] font-normal leading-tight tracking-tight text-ink sm:text-[34px]">{p.title}</h1>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted">{p.lead}</p>
    </div>
  );
}
