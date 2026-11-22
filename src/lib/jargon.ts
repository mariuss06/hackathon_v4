/**
 * "Pe înțelesul antreprenorului": one plain-language sentence per banking indicator,
 * built from the firm's real numbers. Pure module.
 */
import type { Assessment } from "./assessment.ts";
import { cashFreedByDso, SAFE_DSCR } from "./loan-math.ts";
import { tr } from "./i18n/tr.ts";

const ron = (n: number) => `${Math.round(n).toLocaleString("ro-RO")} RON`;
const n2 = (n: number) => n.toLocaleString("ro-RO", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const n1 = (n: number) => n.toLocaleString("ro-RO", { maximumFractionDigits: 1 });

export type JargonKey = "dscr" | "dso" | "concentration" | "storno" | "volatility";

/** Target collection term used in the DSO explanation (common renegotiation target). */
export const DSO_TARGET_DAYS = 30;

export function explain(key: JargonKey, a: Assessment): string {
  const m = a.metrics;
  const b = a.business;
  switch (key) {
    case "dscr": {
      if (b.dscr >= 99) return tr("Firma nu are rate de plătit acum și nici un credit nou cerut, deci nu există un raport de acoperire a datoriei.");
      const pos = b.dscr >= SAFE_DSCR ? tr("Ești peste pragul minim de siguranță al băncilor (1,25).") : b.dscr >= 1 ? tr("Ești sub pragul minim al băncilor (1,25): rata se plătește, dar fără marjă de siguranță.") : tr("Încasările nu acoperă ratele: băncile resping de regulă cererea în această situație.");
      return tr("Pentru fiecare 1 RON pe care trebuie să-l dai la rate, firma ta produce {a} RON. {b}", { a: n2(b.dscr), b: pos });
    }
    case "dso": {
      const days = Math.round(m.dsoDays);
      if (days <= DSO_TARGET_DAYS) return tr("Clienții îți plătesc în medie în {a} de zile — sub {b} de zile, un termen pe care băncile îl consideră sănătos.", { a: days, b: DSO_TARGET_DAYS });
      const freed = cashFreedByDso(m.annualizedRevenue, m.dsoDays, DSO_TARGET_DAYS);
      return tr("Banii tăi stau blocați la clienți {a} de zile. Dacă renegociezi la {b} de zile, eliberezi aproximativ {c} în cash.", { a: days, b: DSO_TARGET_DAYS, c: ron(freed) });
    }
    case "concentration": {
      const top = m.topClients[0]?.name ?? tr("clientul principal");
      const share = m.topClientSharePct;
      if (share < 15) return tr("Cel mai mare client ({a}) aduce doar {b}% din vânzări: dacă pleacă, firma nu e pusă în pericol.", { a: top, b: n1(share) });
      return tr("{a}% din vânzări vin de la {b}. Dacă acest client întârzie plata sau pleacă, pierzi {c} pe an — de aceea băncile vor sub 30–40%.", { a: n1(share), b: top, c: ron((m.annualizedRevenue * share) / 100) });
    }
    case "storno": {
      const st = m.creditNotesSharePct3m;
      return st > 5
        ? tr("În ultimele 3 luni ai anulat (stornat) {a}% din facturile emise. Peste 5%, banca citește asta ca probleme de calitate sau dispute cu clienții.", { a: n1(st) })
        : tr("Stornările (facturi anulate) sunt {a}% din vânzări în ultimele 3 luni — sub pragul de 5% la care băncile pun întrebări.", { a: n1(st) });
    }
    case "volatility": {
      const cv = m.revenueCv * 100;
      return cv < 15
        ? tr("Vânzările lunare variază în medie cu {a}% de la o lună la alta: un venit stabil, ușor de creditat.", { a: n1(cv) })
        : tr("Vânzările lunare variază în medie cu {a}% (cea mai bună lună e de {b} ori cea mai slabă): banca va verifica dacă poți plăti rata și în lunile slabe.", { a: n1(cv), b: n1(m.seasonalityRatio) });
    }
  }
}
