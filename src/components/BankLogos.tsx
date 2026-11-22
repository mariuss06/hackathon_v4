import { cx } from "./ui";

/**
 * Bank identification marks in each bank's brand colours. These are simplified monogram badges drawn
 * from SVG primitives to identify the bank on the recommendation cards — not copies of the official
 * logos (which remain the trademarks of their owners).
 */
interface BankBrand {
  short: string;
  name: string;
  bg: string;
  fg: string;
  accent: string;
  /** Small geometric motif under the monogram. */
  motif: "bar" | "dots" | "wave" | "diamond" | "chevron" | "ring";
}

export const BANK_BRANDS: Record<string, BankBrand> = {
  BCR: { short: "BCR", name: "Banca Comercială Română", bg: "#0b3b8c", fg: "#ffffff", accent: "#5ec4f2", motif: "bar" },
  "Banca Transilvania": { short: "BT", name: "Banca Transilvania", bg: "#003a70", fg: "#ffffff", accent: "#ffd100", motif: "chevron" },
  "ING Bank România": { short: "ING", name: "ING Bank România", bg: "#ff6200", fg: "#ffffff", accent: "#4b0082", motif: "dots" },
  "Raiffeisen Bank România": { short: "RB", name: "Raiffeisen Bank România", bg: "#fff200", fg: "#1a1a1a", accent: "#1a1a1a", motif: "diamond" },
  "CEC Bank": { short: "CEC", name: "CEC Bank", bg: "#00599f", fg: "#ffffff", accent: "#f7a600", motif: "wave" },
  "UniCredit Bank România": { short: "UC", name: "UniCredit Bank România", bg: "#e2001a", fg: "#ffffff", accent: "#ffffff", motif: "ring" },
};

function Motif({ kind, color }: { kind: BankBrand["motif"]; color: string }) {
  switch (kind) {
    case "bar":
      return <rect x="12" y="35" width="24" height="3" rx="1.5" fill={color} />;
    case "chevron":
      return <path d="M17 34.5 24 38l7-3.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
    case "dots":
      return (
        <g fill={color}>
          <circle cx="18" cy="36.5" r="1.8" />
          <circle cx="24" cy="36.5" r="1.8" />
          <circle cx="30" cy="36.5" r="1.8" />
        </g>
      );
    case "diamond":
      return <path d="m24 32.8 3.6 3.6-3.6 3.6-3.6-3.6 3.6-3.6Z" fill={color} />;
    case "wave":
      return <path d="M14 36.5c2.5-2.4 5-2.4 7.5 0s5 2.4 7.5 0 4-2 5-1" stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none" />;
    case "ring":
      return <circle cx="24" cy="36.4" r="2.6" stroke={color} strokeWidth="1.8" fill="none" />;
  }
}

export function BankLogo({ bank, size = 40, className }: { bank: string; size?: number; className?: string }) {
  const b = BANK_BRANDS[bank] ?? { short: bank.slice(0, 3).toUpperCase(), name: bank, bg: "#18221e", fg: "#ffffff", accent: "#4f8a6a", motif: "bar" as const };
  const fontSize = b.short.length >= 3 ? 14 : 17;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={b.name} className={cx("shrink-0", className)}>
      <rect width="48" height="48" rx="12" fill={b.bg} />
      <rect x="0.5" y="0.5" width="47" height="47" rx="11.5" fill="none" stroke="rgba(0,0,0,.08)" />
      <text x="24" y="27.5" textAnchor="middle" fontFamily="var(--font-geist), system-ui, sans-serif" fontWeight="700" fontSize={fontSize} letterSpacing="-0.5" fill={b.fg}>
        {b.short}
      </text>
      <Motif kind={b.motif} color={b.accent} />
    </svg>
  );
}
