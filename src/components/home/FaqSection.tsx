"use client";

import { useLanguage } from "@/components/LanguageProvider";

export function FaqSection() {
  const { t } = useLanguage();
  const f = t.home.faq;
  return (
    <section aria-labelledby="home-faq-title" className="border-t border-line bg-card py-14">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <h2 id="home-faq-title" className="sr-only">
          {f.title}
        </h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-12">
          <div>
            <h3 className="text-lg font-bold text-ink sm:text-xl">{f.q1}</h3>
            <p className="mt-3 text-xs leading-relaxed text-muted sm:text-sm">
              {f.a1a}
              <strong className="font-medium text-ink">e-Factura</strong>
              {f.a1b}
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold text-ink sm:text-xl">{f.q2}</h3>
            <p className="mt-3 text-xs leading-relaxed text-muted sm:text-sm">
              {f.a2}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
