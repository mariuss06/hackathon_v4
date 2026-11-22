"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { en } from "@/lib/i18n/en";
import { ro, type Dict } from "@/lib/i18n/ro";
import { EUR_RON } from "@/lib/pricing";
import { setNumberLocale, type NumberLocale } from "@/lib/util";
import { setTrLang } from "@/lib/i18n/tr";
import { cx } from "./ui";

export type Lang = "ro" | "en";
const DICTS: Record<Lang, Dict> = { ro, en };
const STORAGE_KEY = "credifit-lang";

// --- Tiny external store: localStorage + cookie, shared by every tab ------------------------
const listeners = new Set<() => void>();
function readLang(): Lang {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ro";
  } catch {
    return "ro";
  }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}
function writeLang(lang: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  // Cookie mirror, so a server component can read the preference later if needed.
  document.cookie = `${STORAGE_KEY}=${lang}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach((l) => l());
}

export interface Formatters {
  /** 1.234.567 (RO) / 1,234,567 (EN). */
  number: (n: number, digits?: number) => string;
  /** Amount in RON, or converted to EUR at the reference rate. */
  money: (ron: number, currency?: "RON" | "EUR") => string;
  /** 22.11.2026 (RO) / 22 Nov 2026 (EN). */
  date: (iso: string) => string;
}

function makeFormatters(lang: Lang): Formatters {
  const locale = DICTS[lang].meta.locale;
  return {
    number: (n, digits = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n),
    money: (amount, currency = "RON") =>
      currency === "EUR"
        ? new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount / EUR_RON)
        : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount)} RON`,
    date: (iso) => {
      const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
      return Number.isNaN(d.getTime())
        ? iso
        : new Intl.DateTimeFormat(
            locale,
            lang === "en" ? { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" } : { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" },
          ).format(d);
    },
  };
}
const FORMATTERS: Record<Lang, Formatters> = { ro: makeFormatters("ro"), en: makeFormatters("en") };
const serverLang = (): Lang => "ro";
const setLang = (l: Lang) => writeLang(l);

/**
 * Interface language for one component. Every call reads the store through useSyncExternalStore, so a
 * component that is still hydrating renders with the server language ("ro") and switches right after:
 * no hydration mismatch even for parts of the page that hydrate later. The shared number helpers
 * (num / ron / pct / monthLabel in lib/util) follow the language of the component rendering them.
 */
export function useLanguage() {
  const lang = useSyncExternalStore(subscribe, readLang, serverLang);
  const t = DICTS[lang];
  setNumberLocale(t.meta.locale as NumberLocale);
  setTrLang(lang);
  return { lang, setLang, t, fmt: FORMATTERS[lang] };
}

/** Keeps <html lang> in sync with the chosen language. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  useEffect(() => {
    document.documentElement.lang = t.meta.htmlLang;
  }, [t]);
  return <>{children}</>;
}

/** "RO | EN" segmented switch, used in every header. */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useLanguage();
  return (
    <div role="group" aria-label={t.lang.label} className={cx("inline-flex shrink-0 items-center rounded-full border border-line bg-white/80 p-0.5", className)}>
      {(["ro", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          title={l === lang ? t.lang.label : t.lang.switchTo}
          className={cx(
            "min-w-[34px] rounded-full px-2 py-1 text-[11px] font-semibold tracking-wide transition-colors",
            lang === l ? "bg-navy text-white" : "text-muted hover:text-ink",
          )}
        >
          {l === "ro" ? t.lang.ro : t.lang.en}
        </button>
      ))}
    </div>
  );
}
