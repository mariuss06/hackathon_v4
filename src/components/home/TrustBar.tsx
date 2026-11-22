"use client";

import { Lock, Star } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

export function TrustBar() {
  const { t } = useLanguage();
  const tr = t.home.trust;
  return (
    <section aria-label={tr.aria} className="border-b border-line bg-card">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 text-xs sm:text-sm md:flex-row">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <Lock size={16} aria-hidden className="text-emerald-strong" />
            <span>{tr.privacy}</span>
          </div>

          <p className="text-center text-muted">
            {tr.calibrated}
            <span className="font-medium text-ink">{tr.noBureau}</span>
          </p>

          <div className="flex items-center gap-2">
            <span className="font-bold text-ink">4.9/5</span>
            <span role="img" aria-label={tr.stars} className="flex items-center gap-0.5 text-emerald-strong">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={12} fill="currentColor" strokeWidth={0} aria-hidden />
              ))}
            </span>
            <span className="text-xs font-medium text-muted">{tr.rated}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
