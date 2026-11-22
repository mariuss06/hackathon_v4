"use client";

import { tr } from "@/lib/i18n/tr";
import { useLanguage } from "./LanguageProvider";
import { Card, Disclaimer } from "./ui";

/** Terms / privacy pages: the Romanian texts stay in the (server) page, translated here at render. */
export function LegalDoc({ eyebrow, title, sections }: { eyebrow: string; title: string; sections: { title: string; body: string | string[] }[] }) {
  useLanguage(); // hydration-safe language for every tr() below
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-xs text-faint">{tr(eyebrow)}</p>
        <h1 className="mt-2 break-words text-[26px] font-normal leading-tight tracking-tight text-ink sm:text-[28px]">{tr(title)}</h1>
      </div>
      {sections.map((s) => (
        <Card key={s.title}>
          <h2 className="text-base font-medium text-ink">{tr(s.title)}</h2>
          {Array.isArray(s.body) ? (
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
              {s.body.map((b) => (
                <li key={b}>{tr(b)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-muted">{tr(s.body)}</p>
          )}
        </Card>
      ))}
    </div>
  );
}

/** The shared disclaimer for server-rendered pages (e.g. /pricing), in the interface language. */
export function ClientDisclaimer({ className }: { className?: string }) {
  useLanguage();
  return <Disclaimer className={className} />;
}
