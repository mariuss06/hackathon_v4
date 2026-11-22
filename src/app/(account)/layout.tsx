"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { AccountButtons } from "@/components/AccountButtons";
import { LanguageToggle, useLanguage } from "@/components/LanguageProvider";

/** Account pages (login, register, my account, admin): brand header, no evaluation sidebar. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen">
      <header className="no-print mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-8">
        <Link href="/" aria-label={t.nav.homeAria} className="min-w-0">
          <BrandLogo tagline />
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageToggle />
          <Link href="/onboarding" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted hover:bg-white/70 hover:text-ink">
            <ArrowLeft size={13} /> {t.nav.backToEvaluation}
          </Link>
          <AccountButtons />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] px-4 pb-12 sm:px-8">{children}</main>
      <footer className="no-print mx-auto max-w-[1280px] px-4 pb-8 text-[11px] text-faint sm:px-8">
        {t.home.footer.accountFooter}
        <Link href="/termeni" className="hover:text-ink">
          {t.home.footer.terms}
        </Link>{" "}
        ·{" "}
        <Link href="/confidentialitate" className="hover:text-ink">
          {t.home.footer.privacy}
        </Link>
      </footer>
    </div>
  );
}
