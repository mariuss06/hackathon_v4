"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { useLanguage } from "@/components/LanguageProvider";

export function HomeFooter() {
  const { t } = useLanguage();
  const f = t.home.footer;
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-6 border-b border-line pb-8 md:flex-row md:items-center">
          <Link href="/" aria-label={t.nav.homeAria} className="flex items-center gap-3">
            <BrandLogo tagline />
          </Link>

          <nav aria-label={f.nav} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-muted sm:text-sm">
            <Link href="/pricing/business" className="transition-colors hover:text-ink">
              {f.planBusiness}
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-ink">
              {f.pricing}
            </Link>
          </nav>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 pt-6 text-xs text-muted sm:flex-row">
          <p className="text-center sm:text-left">{f.rights}</p>
          <div className="flex items-center gap-4">
            <Link href="/termeni" className="transition-colors hover:text-ink">
              {f.terms}
            </Link>
            <Link href="/confidentialitate" className="transition-colors hover:text-ink">
              {f.privacy}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
