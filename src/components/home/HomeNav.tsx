"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Home, Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { AccountButtons } from "@/components/AccountButtons";
import { LanguageToggle, useLanguage } from "@/components/LanguageProvider";
import { cx } from "@/components/ui";

/** "Analiză Credit" is intentionally NOT in the menu: the only way to start it is from the home page CTAs. */
const NAV_LINKS = [
  { href: "/", key: "home", home: true },
  { href: "/pricing/business", key: "business" },
  { href: "/pricing", key: "pricing" },
] as const;

/** Internal routes use next/link; same-page section anchors stay plain anchors. */
function NavLink({ href, className, children, onClick }: { href: string; className: string; children: ReactNode; onClick?: () => void }) {
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

export function HomeNav() {
  const path = usePathname();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-card/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3 sm:h-[72px]">
          <Link href="/" aria-label={t.nav.homeAria} className="flex min-w-0 items-center gap-3 focus:outline-none">
            <BrandLogo tagline />
          </Link>

          <nav aria-label={t.nav.mainNav} className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                className={cx(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                  path === link.href ? "bg-navy text-white" : "text-muted hover:bg-canvas hover:text-ink",
                )}
              >
                {"home" in link && link.home ? <Home size={15} aria-hidden /> : null}
                {t.nav[link.key]}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <LanguageToggle />
            <span className="hidden lg:inline-flex">
              <AccountButtons />
            </span>
            <Link
              href="/onboarding"
              className="hidden items-center gap-1.5 whitespace-nowrap rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white shadow-card transition-colors hover:bg-navy-2 sm:inline-flex"
            >
              <span>{t.nav.start}</span>
              <ArrowRight size={14} aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
              aria-expanded={open}
              aria-controls="home-mobile-menu"
              className="rounded-xl border border-line p-2.5 text-ink transition-colors hover:bg-canvas lg:hidden"
            >
              {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div id="home-mobile-menu" className="border-t border-line bg-card px-4 pb-5 pt-2 lg:hidden">
          <nav aria-label={t.nav.mobileNav} className="space-y-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cx("block rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", path === link.href ? "bg-navy text-white" : "text-ink hover:bg-canvas")}
              >
                {t.nav[link.key]}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
            <Link
              href="/onboarding"
              onClick={() => setOpen(false)}
              className="w-full rounded-full bg-navy px-4 py-2.5 text-center text-xs font-semibold text-white transition-colors hover:bg-navy-2"
            >
              {t.nav.startFree}
            </Link>
          </div>
          <div className="mt-3 flex justify-center border-t border-line pt-3">
            <AccountButtons />
          </div>
        </div>
      )}
    </header>
  );
}
